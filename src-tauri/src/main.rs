// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

/// 缓存 (proxy 配置, reqwest Client)：proxy 没变就复用连接池
struct HttpClient(Mutex<Option<(String, reqwest::Client)>>);

/// 缩略图/头像缓存：url → data URL（超上限整体清空）
struct ImageCache(Mutex<HashMap<String, String>>);

/// 允许代理加载图片的域名白名单（YouTube 缩略图 / 频道头像 / 评论头像）
const IMG_HOSTS: [&str; 4] = [
    "i.ytimg.com",
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
#[tauri::command]
async fn yt_fetch(
    url: String,
    proxy: String,
    state: State<'_, HttpClient>,
) -> Result<FetchResult, String> {
    let client = client_for(&proxy, &state)?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    Ok(FetchResult { status, body })
}

/// 缩略图/头像经代理加载，返回 data URL（内存缓存，避免重复拉取）。
/// 只放行 IMG_HOSTS 白名单域名，防止被当通用代理用。
#[tauri::command]
async fn yt_image(
    url: String,
    proxy: String,
    http: State<'_, HttpClient>,
    cache: State<'_, ImageCache>,
) -> Result<String, String> {
    if let Some(hit) = cache.0.lock().map_err(|e| e.to_string())?.get(&url) {
        return Ok(hit.clone());
    }

    let rest = url.split("://").nth(1).ok_or("无效的图片地址")?;
    let host = rest.split('/').next().unwrap_or("");
    let allowed = IMG_HOSTS
        .iter()
        .any(|h| host == *h || host.ends_with(&format!(".{h}")));
    if !allowed {
        return Err(format!("图片域名不在白名单：{host}"));
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

    let mime = sniff_mime(&bytes);
    use base64::Engine as _;
    let data_url = format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&bytes)
    );

    let mut map = cache.0.lock().map_err(|e| e.to_string())?;
    if map.len() > 400 {
        map.clear();
    }
    map.insert(url, data_url.clone());
    Ok(data_url)
}

fn main() {
    // WebView2 代理：iframe 视频播放走 WebView 网络栈，应用内代理（yt_fetch）管不到，
    // 只能在 WebView 环境创建前通过启动参数挂代理。前端会把设置页的 proxy 同步到
    // proxy.txt，这里在进程启动时读取并注入 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS。
    if let Some(p) = read_webview_proxy() {
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            format!("--proxy-server={p}"),
        );
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(HttpClient(Mutex::new(None)))
        .manage(ImageCache(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![yt_fetch, yt_image, save_webview_proxy])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// proxy 持久化文件：%LOCALAPPDATA%/youtube-desktop/proxy.txt
fn proxy_file_path() -> Option<std::path::PathBuf> {
    let base = std::env::var("LOCALAPPDATA").ok()?;
    Some(std::path::Path::new(&base).join("youtube-desktop").join("proxy.txt"))
}

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

/// 前端在保存设置 / 应用启动时调用，把 proxy 落盘（下次启动对 WebView 生效）
#[tauri::command]
fn save_webview_proxy(proxy: String) -> Result<(), String> {
    let path = proxy_file_path().ok_or("无法定位 LOCALAPPDATA")?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, proxy.trim()).map_err(|e| e.to_string())
}
