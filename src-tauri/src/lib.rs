//! Tauri 应用主体（桌面 main 与 Android/iOS 移动入口共用）。
//! tauri android build 要求 crate 提供 lib target（cargo build --lib），
//! main.rs 仅保留 Windows 薄壳调用本 crate 的 run()。

use std::collections::HashMap;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager, State};

/// 缓存 (proxy 配置, reqwest Client)：proxy 没变就复用连接池
struct HttpClient(Mutex<Option<(String, reqwest::Client)>>);

/// 缩略图/头像缓存：url → data URL（超上限整体清空）
struct ImageCache(Mutex<HashMap<String, String>>);

/// 视频下载管理：当前任务 id + 各任务的取消标记
struct DownloadState {
    active: Mutex<Option<String>>,
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

/// 允许代理加载图片的域名白名单（YouTube 缩略图 / 频道头像 / 评论头像）。
/// ytimg.com 用后缀匹配：RSS 缩略图在 i1~i9.ytimg.com 分片域名上，
/// InnerTube 在 i.ytimg.com，统一放行 *.ytimg.com。
const IMG_HOSTS: [&str; 4] = [
    "ytimg.com",
    "yt3.ggpht.com",
    "yt3.googleusercontent.com",
    "lh3.googleusercontent.com",
];

fn build_client(proxy: &str) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent("youtube-desktop/0.1")
        .timeout(std::time::Duration::from_secs(20));
    let proxy = proxy.trim();
    if !proxy.is_empty() {
        let p = if proxy.contains("://") {
            proxy.to_string()
        } else {
            format!("http://{proxy}")
        };
        builder = builder.proxy(reqwest::Proxy::all(&p).map_err(|e| e.to_string())?);
    }
    builder.build().map_err(|e| e.to_string())
}

/// 取（或按 proxy 变化重建）共享 Client
fn client_for(proxy: &str, state: &State<'_, HttpClient>) -> Result<reqwest::Client, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    match guard.as_ref() {
        Some((p, c)) if p == proxy => Ok(c.clone()),
        _ => {
            let c = build_client(proxy)?;
            *guard = Some((proxy.to_string(), c.clone()));
            Ok(c)
        }
    }
}

/// 按文件头识别图片 MIME（ytimg 是 jpg，googleusercontent 有 png/webp）
fn sniff_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        "image/png"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/jpeg"
    }
}

#[derive(serde::Serialize)]
struct FetchResult {
    status: u16,
    body: String,
}

/// 前端 fetch 没法按请求设代理，YouTube API 请求统一走这里：
/// 桌面端用 reqwest + 设置页配置的代理；网页端仍用浏览器自身网络栈。
/// method/body/content_type 可选：官方 Data API 走 GET，InnerTube 端点走 POST + JSON。
#[tauri::command]
async fn yt_fetch(
    url: String,
    proxy: String,
    method: Option<String>,
    body: Option<String>,
    content_type: Option<String>,
    headers: Option<std::collections::HashMap<String, String>>,
    state: State<'_, HttpClient>,
) -> Result<FetchResult, String> {
    let client = client_for(&proxy, &state)?;
    let m = method.unwrap_or_else(|| "GET".to_string());
    let m = m.to_uppercase();
    let mut req = match m.as_str() {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        "DELETE" => client.delete(&url),
        _ => client.get(&url),
    };
    if let Some(ct) = content_type {
        req = req.header("Content-Type", ct);
    }
    if let Some(hs) = headers {
        for (k, v) in hs {
            req = req.header(&k, &v);
        }
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(FetchResult { status, body })
}

/// 图片磁盘缓存路径：<app_cache_dir>/img-cache/<fnv1a(url)>.img
/// 头像等不常变化的图片跨会话缓存，避免每次启动重新请求（30 天过期）。
/// 用 Tauri 的 app_cache_dir 而非 LOCALAPPDATA 环境变量：Android 上没有该变量，
/// 之前会导致移动端磁盘缓存永远不命中、每次启动重新拉全部头像。
fn image_cache_path(app: &tauri::AppHandle, url: &str) -> Option<std::path::PathBuf> {
    let dir = app.path().app_cache_dir().ok()?;
    let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV-1a 64
    for b in url.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    Some(dir.join("img-cache").join(format!("{h:016x}.img")))
}

/// bytes → data URL（按文件头识别 MIME）
fn to_data_url(bytes: &[u8]) -> String {
    let mime = sniff_mime(bytes);
    use base64::Engine as _;
    format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// 缩略图/头像经代理加载，返回 data URL（三级缓存：内存 → 磁盘 30 天 → 代理拉取）。
/// 只放行 IMG_HOSTS 白名单域名，防止被当通用代理用。
#[tauri::command]
async fn yt_image(
    app: tauri::AppHandle,
    url: String,
    proxy: String,
    http: State<'_, HttpClient>,
    cache: State<'_, ImageCache>,
) -> Result<String, String> {
    if let Some(hit) = cache.0.lock().map_err(|e| e.to_string())?.get(&url) {
        return Ok(hit.clone());
    }

    // 白名单校验
    let rest = url.split("://").nth(1).ok_or("无效的图片地址")?;
    let host = rest.split('/').next().unwrap_or("");
    let allowed = IMG_HOSTS
        .iter()
        .any(|h| host == *h || host.ends_with(&format!(".{h}")));
    if !allowed {
        return Err(format!("图片域名不在白名单：{host}"));
    }

    // 磁盘缓存命中（30 天内）直接回填
    let disk = image_cache_path(&app, &url);
    if let Some(p) = &disk {
        if let Ok(meta) = std::fs::metadata(p) {
            let fresh = meta
                .modified()
                .ok()
                .and_then(|m| m.elapsed().ok())
                .map(|d| d.as_secs() < 30 * 86_400)
                .unwrap_or(false);
            if fresh {
                if let Ok(bytes) = std::fs::read(p) {
                    let data_url = to_data_url(&bytes);
                    if let Ok(mut map) = cache.0.lock() {
                        if map.len() > 400 {
                            map.clear();
                        }
                        map.insert(url.clone(), data_url.clone());
                    }
                    return Ok(data_url);
                }
            }
        }
    }

    let client = client_for(&proxy, &http)?;
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    // 落盘缓存（尽力而为，失败不影响返回）
    if let Some(p) = &disk {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(p, &bytes);
    }

    let data_url = to_data_url(&bytes);
    let mut map = cache.0.lock().map_err(|e| e.to_string())?;
    if map.len() > 400 {
        map.clear();
    }
    map.insert(url, data_url.clone());
    Ok(data_url)
}

/// 用 refresh token 换新 access token（OAuth 2 标准流程）。
/// access token 约 1 小时过期，配置 refresh token 后前端 401 时自动续期。
#[tauri::command]
async fn yt_refresh_token(
    refresh_token: String,
    client_id: String,
    client_secret: String,
    proxy: String,
    http: State<'_, HttpClient>,
) -> Result<String, String> {
    let client = client_for(&proxy, &http)?;
    let params = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token.as_str()),
        ("client_id", client_id.as_str()),
        ("client_secret", client_secret.as_str()),
    ];
    let resp = client
        .post("https://oauth2.googleapis.com/token")
        .form(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("解析 token 响应失败: {e}"))?;
    if status != 200 {
        let msg = body
            .get("error_description")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("error").and_then(|v| v.as_str()))
            .unwrap_or("刷新失败");
        return Err(msg.to_string());
    }
    body.get("access_token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "token 响应缺少 access_token".to_string())
}

/// 下载更新包到临时目录（流式写盘，进度经 update-download-progress 事件推送）。
/// 更新通道与数据请求共用代理（官方 updater 插件走不了应用内代理，本地网络直连 GitHub 不可靠）。
/// Windows 桌面专属（配套 NSIS 静默安装链）；Android 走「检查更新 → 跳浏览器下载 APK」。
#[cfg(windows)]
#[tauri::command]
async fn download_update(
    url: String,
    proxy: String,
    filename: String,
    app: tauri::AppHandle,
    state: State<'_, HttpClient>,
) -> Result<String, String> {
    let client = client_for(&proxy, &state)?;
    let mut resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("下载失败（HTTP {}）", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    let dest = std::env::temp_dir().join(&filename);
    let mut file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    use std::io::Write;
    loop {
        match resp.chunk().await.map_err(|e| e.to_string())? {
            Some(chunk) => {
                file.write_all(&chunk).map_err(|e| e.to_string())?;
                downloaded += chunk.len() as u64;
                let _ = app.emit(
                    "update-download-progress",
                    serde_json::json!({ "downloaded": downloaded, "total": total }),
                );
            }
            None => break,
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

/// 非 Windows（Android）：下载 APK 到应用内部缓存 apk/ 目录，返回路径交前端
/// 经原生 JS 桥（AndroidBridge.installApk）弹系统安装界面。更新通道与数据请求共用代理。
#[cfg(not(windows))]
#[tauri::command]
async fn download_update(
    url: String,
    proxy: String,
    filename: String,
    app: tauri::AppHandle,
    state: State<'_, HttpClient>,
) -> Result<String, String> {
    use tauri::Manager;
    let client = client_for(&proxy, &state)?;
    let mut resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("下载失败（HTTP {}）", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    // 内部缓存 apk/ 子目录（file_paths.xml 只暴露该目录给安装器）
    let dir = app
        .path()
        .cache_dir()
        .map_err(|e| e.to_string())?
        .join("apk");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(&filename);
    let mut file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    use std::io::Write;
    loop {
        match resp.chunk().await.map_err(|e| e.to_string())? {
            Some(chunk) => {
                file.write_all(&chunk).map_err(|e| e.to_string())?;
                downloaded += chunk.len() as u64;
                let _ = app.emit(
                    "update-download-progress",
                    serde_json::json!({ "downloaded": downloaded, "total": total }),
                );
            }
            None => break,
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

/// 非 Windows（Android）：无静默安装通道——安装由前端原生桥弹系统安装界面完成。
#[cfg(not(windows))]
#[tauri::command]
fn finish_update(_installer: String, _app: tauri::AppHandle) -> Result<(), String> {
    Err("桌面端专属；移动端经 AndroidBridge.installApk 弹系统安装界面".to_string())
}

/// 静默安装更新：起独立 cmd 链「等当前进程退出 → 静默安装 → 启动新版本」，
/// 随后退出当前应用。安装器替换文件前应用必须先退出，否则 exe 被占用会失败。
#[cfg(windows)]
#[tauri::command]
fn finish_update(installer: String, app: tauri::AppHandle) -> Result<(), String> {
    let exe = std::env::current_exe()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
    // ping -n 4 ≈ 等 3 秒让当前应用退出；/S 静默安装；/D= 指定安装目录
    // （NSIS 规范：/D= 必须是最后一个参数且不加引号，含空格也原样取到行尾）
    // 保证更新安装回当前安装位置；完成后重新打开新版本。
    // 注意：必须用 raw_arg 原样传整条命令——普通 arg 会被 Rust 转义成 \"，
    // 而 cmd 不认 \" 转义，引号语义错乱会导致安装器被当成命令名执行失败。
    let install_dir = Path::new(&exe)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();
    let script = format!(
        "ping 127.0.0.1 -n 4 >nul & \"{}\" /S /D={} & start \"\" \"{}\"",
        installer, install_dir, exe
    );
    std::process::Command::new("cmd")
        .arg("/C")
        .raw_arg(&script)
        .spawn()
        .map_err(|e| e.to_string())?;
    // 留出时间给 cmd 链启动后再退出
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(500));
        app.exit(0);
    });
    Ok(())
}

/* ============================ 视频下载 ============================ */

/// 下载任务被用户取消的哨兵错误（对外不展示）
const CANCELLED: &str = "__CANCELLED__";

/// ffmpeg 自动下载源（gyan.dev release-essentials，约 35MB，含 ffmpeg.exe）
const FFMPEG_URL: &str = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";

/// 前端下达的下载任务（camelCase 序列化）
#[derive(serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct VideoDownloadTask {
    video_id: String,
    title: String,
    channel_title: String,
    duration: String,
    thumb_url: String,
    dir: String,
    quality: String,
    needs_merge: bool,
    video_url: String,
    video_size: u64,
    audio_url: Option<String>,
    audio_size: u64,
    ffmpeg_path: Option<String>,
}

/// 下载媒体流：无总超时（大文件可持续很久），分块写盘 + 0.1% 步进限频的进度事件
async fn download_to(
    client: &reqwest::Client,
    url: &str,
    dest: &Path,
    flag: &AtomicBool,
    id: &str,
    stage: &str,
    start_pct: f64,
    span_pct: f64,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let mut resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("下载失败（HTTP {}）", resp.status().as_u16()));
    }
    let total = resp.content_length().unwrap_or(0);
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    let mut got: u64 = 0;
    let mut last_emitted: i32 = -1;
    use std::io::Write;
    loop {
        if flag.load(Ordering::Relaxed) {
            return Err(CANCELLED.to_string());
        }
        match resp.chunk().await.map_err(|e| e.to_string())? {
            Some(chunk) => {
                file.write_all(&chunk).map_err(|e| e.to_string())?;
                got += chunk.len() as u64;
                if total > 0 {
                    let pct = start_pct + span_pct * (got as f64 / total as f64);
                    let step = (pct * 10.0) as i32;
                    if step != last_emitted {
                        last_emitted = step;
                        let _ = app.emit(
                            "video-download-progress",
                            serde_json::json!({ "id": id, "stage": stage, "percent": pct }),
                        );
                    }
                }
            }
            None => break,
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// 文件名安全主干：去非法字符/控制字符，限 80 字符，保证含 videoId 防重名
fn safe_stem(title: &str, video_id: &str) -> String {
    let cleaned: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            _ => c,
        })
        .filter(|c| !c.is_control())
        .collect();
    let s: String = cleaned.trim().chars().take(80).collect();
    let s = s.trim();
    if s.is_empty() {
        format!("video [{video_id}]")
    } else {
        format!("{s} [{video_id}]")
    }
}

/// 追加（去重）清单条目：<下载目录>/.ytdl-manifest.json
fn write_manifest_entry(task: &VideoDownloadTask, mp4_name: &str, jpg_name: &str, size: u64) -> Result<(), String> {
    let mpath = Path::new(&task.dir).join(".ytdl-manifest.json");
    let mut root: serde_json::Value = std::fs::read_to_string(&mpath)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_else(|| serde_json::json!({ "videos": [] }));
    if !root.is_object() {
        root = serde_json::json!({ "videos": [] });
    }
    let obj = root.as_object_mut().ok_or("清单格式异常")?;
    let videos = obj.entry("videos").or_insert_with(|| serde_json::json!([]));
    if let Some(arr) = videos.as_array_mut() {
        arr.retain(|v| v.get("videoId").and_then(|x| x.as_str()) != Some(task.video_id.as_str()));
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        arr.push(serde_json::json!({
            "videoId": task.video_id,
            "title": task.title,
            "channelTitle": task.channel_title,
            "duration": task.duration,
            "quality": task.quality,
            "filename": mp4_name,
            "thumb": jpg_name,
            "thumbPath": Path::new(&task.dir).join(jpg_name).to_string_lossy(),
            "size": size,
            "path": Path::new(&task.dir).join(mp4_name).to_string_lossy(),
            "downloadedAt": now,
        }));
    }
    std::fs::write(&mpath, serde_json::to_string_pretty(&root).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

/// 确保 ffmpeg 可用：设置覆盖 → 应用数据目录已缓存 → 经代理自动下载 gyan.dev 包并解压
async fn ensure_ffmpeg(
    app: &tauri::AppHandle,
    override_path: Option<&str>,
    client: &reqwest::Client,
    flag: &AtomicBool,
    id: &str,
) -> Result<PathBuf, String> {
    if let Some(p) = override_path {
        let p = p.trim();
        if !p.is_empty() {
            let pb = PathBuf::from(p);
            if pb.exists() {
                return Ok(pb);
            }
            return Err(format!("设置中指定的 ffmpeg 不存在：{p}"));
        }
    }
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let bundled = data_dir.join("ffmpeg").join("ffmpeg.exe");
    if bundled.exists() {
        return Ok(bundled);
    }
    let zip_path = std::env::temp_dir().join("ffmpeg-essentials.zip");
    download_to(client, FFMPEG_URL, &zip_path, flag, id, "ffmpeg", 0.0, 99.0, app).await?;
    let f = std::fs::File::open(&zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(f).map_err(|e| format!("ffmpeg 压缩包解析失败：{e}"))?;
    let mut found = false;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().map(|s| s.to_string()).unwrap_or_default();
        if name.ends_with("bin/ffmpeg.exe") {
            std::fs::create_dir_all(bundled.parent().unwrap()).map_err(|e| e.to_string())?;
            let mut out = std::fs::File::create(&bundled).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
            found = true;
            break;
        }
    }
    let _ = std::fs::remove_file(&zip_path);
    if !found {
        return Err("ffmpeg 压缩包中未找到 ffmpeg.exe（源文件可能已变更）".into());
    }
    Ok(bundled)
}

/// 单任务下载主流程：视频轨/音频轨 → 缩略图 → 合流/直移 → 写清单
async fn run_video_download(task: VideoDownloadTask, proxy: String, flag: Arc<AtomicBool>, app: tauri::AppHandle) -> Result<(), String> {
    let emit = |stage: &str, percent: f64, error: Option<String>, filename: Option<String>| {
        let _ = app.emit(
            "video-download-progress",
            serde_json::json!({ "id": task.video_id, "stage": stage, "percent": percent, "error": error, "filename": filename }),
        );
    };
    // 媒体下载专用 client：不设总超时（请求头 Content-Length 仍在，进度按需计算）
    let mut builder = reqwest::Client::builder()
        .user_agent("youtube-desktop/0.2")
        .connect_timeout(std::time::Duration::from_secs(20));
    let p = proxy.trim();
    if !p.is_empty() {
        let p = if p.contains("://") { p.to_string() } else { format!("http://{p}") };
        builder = builder.proxy(reqwest::Proxy::all(&p).map_err(|e| e.to_string())?);
    }
    let client = builder.build().map_err(|e| e.to_string())?;

    let tmp = std::env::temp_dir().join(format!("ytdl-{}", task.video_id));
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let vpath = tmp.join("video.bin");
    let apath = tmp.join("audio.bin");

    let result: Result<(), String> = async {
        download_to(&client, &task.video_url, &vpath, &flag, &task.video_id, "video", 0.0, 88.0, &app).await?;
        if let Some(url) = &task.audio_url {
            download_to(&client, url, &apath, &flag, &task.video_id, "audio", 88.0, 8.0, &app).await?;
        }

        std::fs::create_dir_all(&task.dir).map_err(|e| e.to_string())?;
        let base = safe_stem(&task.title, &task.video_id);
        let mp4_name = format!("{base}.mp4");
        let jpg_name = format!("{base}.jpg");
        // 缩略图尽力保存（失败不影响下载）
        if !task.thumb_url.is_empty() {
            if let Ok(resp) = client.get(&task.thumb_url).send().await {
                if let Ok(bytes) = resp.bytes().await {
                    let _ = std::fs::write(Path::new(&task.dir).join(&jpg_name), &bytes);
                }
            }
        }

        let dest = Path::new(&task.dir).join(&mp4_name);
        emit("mux", 97.0, None, Some(mp4_name.clone()));
        if task.needs_merge {
            let ffmpeg = ensure_ffmpeg(&app, task.ffmpeg_path.as_deref(), &client, &flag, &task.video_id).await?;
            if flag.load(Ordering::Relaxed) {
                return Err(CANCELLED.to_string());
            }
            let v = vpath.clone();
            let a = apath.clone();
            let d = dest.clone();
            let output = tauri::async_runtime::spawn_blocking(move || {
                std::process::Command::new(&ffmpeg)
                    .arg("-y")
                    .arg("-i").arg(&v)
                    .arg("-i").arg(&a)
                    .args(["-c", "copy", "-movflags", "+faststart"])
                    .arg(&d)
                    .output()
            })
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("ffmpeg 执行失败：{e}"))?;
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let tail: String = stderr
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .rev()
                    .take(3)
                    .collect::<Vec<_>>()
                    .into_iter()
                    .rev()
                    .collect::<Vec<_>>()
                    .join(" | ");
                return Err(format!("ffmpeg 合流失败：{tail}"));
            }
        } else {
            // 单文件：跨卷 rename 会失败，失败时 copy 兜底
            if std::fs::rename(&vpath, &dest).is_err() {
                std::fs::copy(&vpath, &dest).map_err(|e| e.to_string())?;
            }
        }

        let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(task.video_size + task.audio_size);
        write_manifest_entry(&task, &mp4_name, &jpg_name, size)?;
        emit("done", 100.0, None, Some(mp4_name));
        Ok(())
    }
    .await;

    // 无论成败清理临时目录
    let _ = std::fs::remove_dir_all(&tmp);
    result
}

/// 读取文本文件（博主管理 JSON 导入等；路径经 dialog 选择器产生）
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// 写入文本文件（博主管理 JSON 导出等；路径经 dialog 选择器产生）
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    if let Some(dir) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

/// 启动一个视频下载任务（同一时刻仅一个任务在跑，前端 store 负责排队）
#[tauri::command]
async fn start_video_download(
    task: VideoDownloadTask,
    proxy: String,
    app: tauri::AppHandle,
    state: State<'_, DownloadState>,
) -> Result<(), String> {
    {
        let mut active = state.active.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("已有下载任务进行中".to_string());
        }
        *active = Some(task.video_id.clone());
    }
    let flag = Arc::new(AtomicBool::new(false));
    if let Ok(mut m) = state.cancel_flags.lock() {
        m.insert(task.video_id.clone(), flag.clone());
    }
    tauri::async_runtime::spawn(async move {
        let result = run_video_download(task.clone(), proxy, flag, app.clone()).await;
        if let Some(st) = app.try_state::<DownloadState>() {
            if let Ok(mut a) = st.active.lock() {
                *a = None;
            }
            if let Ok(mut m) = st.cancel_flags.lock() {
                m.remove(&task.video_id);
            }
        }
        match result {
            Ok(()) => {}
            Err(e) if e == CANCELLED => {
                let _ = app.emit(
                    "video-download-progress",
                    serde_json::json!({ "id": task.video_id, "stage": "cancelled", "percent": 0.0 }),
                );
            }
            Err(e) => {
                let _ = app.emit(
                    "video-download-progress",
                    serde_json::json!({ "id": task.video_id, "stage": "error", "percent": 0.0, "error": e }),
                );
            }
        }
    });
    Ok(())
}

/// 取消进行中的下载（前端 store 对排队中的任务直接本地移除）
#[tauri::command]
fn cancel_video_download(video_id: String, state: State<'_, DownloadState>) -> Result<(), String> {
    if let Ok(m) = state.cancel_flags.lock() {
        if let Some(f) = m.get(&video_id) {
            f.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

/// 读取下载清单（不存在或损坏时返回空清单）
#[tauri::command]
fn read_download_manifest(dir: String) -> serde_json::Value {
    let path = Path::new(&dir).join(".ytdl-manifest.json");
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| serde_json::json!({ "videos": [] })),
        Err(_) => serde_json::json!({ "videos": [] }),
    }
}

/// 扫描下载目录里的 mp4 文件名（离线页与清单交叉校验）
#[tauri::command]
fn list_download_dir(dir: String) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if name.to_lowercase().ends_with(".mp4") {
                out.push(name);
            }
        }
    }
    out.sort();
    out
}

/// 删除离线视频（mp4 + 缩略图 + 清单条目；前端已做二次确认）
#[tauri::command]
fn delete_offline_video(dir: String, video_id: String, filename: String) -> Result<(), String> {
    let base = Path::new(&dir);
    let _ = std::fs::remove_file(base.join(&filename));
    if let Some(stem) = Path::new(&filename).file_stem() {
        let _ = std::fs::remove_file(base.join(format!("{}.jpg", stem.to_string_lossy())));
    }
    let mpath = base.join(".ytdl-manifest.json");
    if let Ok(s) = std::fs::read_to_string(&mpath) {
        if let Ok(mut root) = serde_json::from_str::<serde_json::Value>(&s) {
            if let Some(arr) = root.get_mut("videos").and_then(|v| v.as_array_mut()) {
                arr.retain(|v| v.get("videoId").and_then(|x| x.as_str()) != Some(video_id.as_str()));
                if let Ok(txt) = serde_json::to_string_pretty(&root) {
                    let _ = std::fs::write(&mpath, txt);
                }
            }
        }
    }
    Ok(())
}

/// WebView2 代理：iframe 视频播放走 WebView 网络栈，应用内代理（yt_fetch）管不到。
/// Windows 桌面双保险之一：启动前注入 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS 环境变量
/// （另一处在 build_main_window 的 proxy_url）。
/// Android System WebView 不支持 --proxy-server 命令行注入，空实现（reqwest 层代理不受影响）。
#[cfg(windows)]
fn init_webview_proxy_env() {
    if let Some(p) = read_webview_proxy() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            format!("--proxy-server={p}"),
        );
    }
}
#[cfg(not(windows))]
fn init_webview_proxy_env() {}

/// 主窗口创建：
/// - Windows 桌面：代码创建（tauri.conf.json 不声明窗口），以便按代理配置创建 WebView；
/// - 非 Windows（Android）：窗口由 tauri.android.conf.json 的 app.windows 声明创建——
///   Android System WebView 无 --proxy-server 注入通道，按代理建窗无意义，
///   且回退桌面默认代理（127.0.0.1:7897）在真机上必然不可达。
#[cfg(windows)]
fn build_main_window(app: &tauri::App) -> tauri::Result<()> {
    let mut builder = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
        .title("YouTube Desktop")
        .inner_size(1360.0, 860.0)
        .min_inner_size(900.0, 600.0)
        .resizable(true)
        .decorations(false)
        // 禁用触屏双指捏合缩放（--disable-pinch；前三个 disable-features 是 wry 的 Windows 默认参数，
        // 自定义 additional_browser_args 后会被整体替换，需一并带上）
        .additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --disable-pinch");
    if let Some(p) = read_webview_proxy() {
        match p.parse::<tauri::Url>() {
            Ok(u) => builder = builder.proxy_url(u),
            Err(e) => eprintln!("代理地址解析失败（{p}）：{e}，WebView 将直连"),
        }
    }
    builder.build()?;
    Ok(())
}
#[cfg(not(windows))]
fn build_main_window(_app: &tauri::App) -> tauri::Result<()> {
    Ok(())
}

/// 桌面/移动共用启动入口：mobile_entry_point 在 Android/iOS 生成原生 main 桥接
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_webview_proxy_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // 观看记录本地库（SQLite）；启动迁移建表
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(
                    "sqlite:history.db",
                    vec![tauri_plugin_sql::Migration {
                        version: 1,
                        description: "create_watch_history",
                        sql: "CREATE TABLE IF NOT EXISTS watch_history (video_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', channel_id TEXT NOT NULL DEFAULT '', channel_title TEXT NOT NULL DEFAULT '', thumb TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', watched_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_wh_watched_at ON watch_history(watched_at);",
                        kind: tauri_plugin_sql::MigrationKind::Up,
                    }],
                )
                .build(),
        )
        .manage(HttpClient(Mutex::new(None)))
        .manage(ImageCache(Mutex::new(HashMap::new())))
        .manage(DownloadState {
            active: Mutex::new(None),
            cancel_flags: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            yt_fetch,
            yt_image,
            save_webview_proxy,
            yt_refresh_token,
            download_update,
            finish_update,
            start_video_download,
            cancel_video_download,
            read_download_manifest,
            list_download_dir,
            delete_offline_video,
            read_text_file,
            write_text_file
        ])
        .setup(|app| {
            // 上次运行残留的下载临时目录（>24h）后台清理
            std::thread::spawn(|| {
                if let Ok(entries) = std::fs::read_dir(std::env::temp_dir()) {
                    for e in entries.flatten() {
                        if !e.file_name().to_string_lossy().starts_with("ytdl-") {
                            continue;
                        }
                        if let Ok(meta) = e.metadata() {
                            if let Ok(modified) = meta.modified() {
                                if modified.elapsed().map(|d| d.as_secs() > 86_400).unwrap_or(false) {
                                    let _ = std::fs::remove_dir_all(e.path());
                                }
                            }
                        }
                    }
                }
            });
            // 主窗口创建：Windows 桌面按代理配置建 WebView（tauri.conf.json 不声明窗口）；
            // Android 窗口由 tauri.android.conf.json 声明创建（见 build_main_window 注释）
            build_main_window(app)?;

            // Android：清理上次应用内更新下载的 APK 安装包（cache/apk/）。
            // 系统安装器弹出后拿不到安装结果回调，统一在下次启动时删除——
            // 安装成功包已无用；安装失败用户重新下载即可，不留残留占空间
            #[cfg(not(windows))]
            {
                use tauri::Manager;
                let apk_dir = app.path().cache_dir().ok().map(|d| d.join("apk"));
                if let Some(dir) = apk_dir {
                    let _ = std::fs::remove_dir_all(dir);
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// proxy 持久化文件：%LOCALAPPDATA%/youtube-desktop/proxy.txt
/// （Windows 桌面专属链：Android 无 LOCALAPPDATA，WebView 代理注入也不可用）
#[cfg(windows)]
fn proxy_file_path() -> Option<std::path::PathBuf> {
    let base = std::env::var("LOCALAPPDATA").ok()?;
    Some(std::path::Path::new(&base).join("youtube-desktop").join("proxy.txt"))
}

#[cfg(windows)]
fn normalize_proxy(proxy: &str) -> Option<String> {
    let p = proxy.trim();
    if p.is_empty() {
        return None;
    }
    Some(if p.contains("://") {
        p.to_string()
    } else {
        format!("http://{p}")
    })
}

/// 启动时读取已持久化的 proxy（返回归一化后的代理 URL）。
#[cfg(windows)]
/// 文件不存在（全新安装、前端还没落盘过）时回退默认代理，
/// 保证首次启动 WebView 就能挂代理；文件存在但为空 = 用户主动直连。
fn read_webview_proxy() -> Option<String> {
    const DEFAULT_PROXY: &str = "127.0.0.1:7897";
    let content = proxy_file_path().and_then(|p| std::fs::read_to_string(p).ok());
    match content {
        Some(s) => normalize_proxy(&s),
        None => normalize_proxy(DEFAULT_PROXY),
    }
}

/// 前端在保存设置 / 应用启动时调用，把 proxy 落盘（下次启动对 WebView 生效）。
/// Windows 桌面：落盘后下次启动 WebView2 按 --proxy-server 挂代理；
/// Android：System WebView 无该注入通道，空实现（数据/图片请求的 reqwest 代理即时生效不受影响）。
#[cfg(windows)]
#[tauri::command]
fn save_webview_proxy(proxy: String) -> Result<(), String> {
    let path = proxy_file_path().ok_or("无法定位 LOCALAPPDATA")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, proxy.trim()).map_err(|e| e.to_string())
}

/// 非 Windows（Android）：WebView 代理注入不可用，空实现保持命令通道一致。
#[cfg(not(windows))]
#[tauri::command]
fn save_webview_proxy(_proxy: String) -> Result<(), String> {
    Ok(())
}
