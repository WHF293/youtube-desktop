//! TikTok 官网壳应用（独立 exe）：主窗口直接加载 tiktok.com（tauri.conf.json 声明），
//! 无本地前端、无自定义命令、无 IPC——纯浏览壳。
//! 代理注入与 youtube-desktop 同机制：进程级 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS，
//! 读取顺序 = 自身 app data proxy.txt → youtube-desktop 的 proxy.txt（YouTube 设置页
//! 改代理即两应用同时生效）→ 默认 7897。

#[cfg(windows)]
const DEFAULT_PROXY: &str = "127.0.0.1:7897";

/// 读代理文件（ Trim 后非空才算；空文件 = 用户主动直连）
#[cfg(windows)]
fn read_proxy() -> Option<String> {
    let base = std::env::var("LOCALAPPDATA").ok()?;
    for dir in ["tiktok-desktop", "youtube-desktop"] {
        let p = std::path::Path::new(&base).join(dir).join("proxy.txt");
        if let Ok(s) = std::fs::read_to_string(&p) {
            let s = s.trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
    }
    Some(DEFAULT_PROXY.to_string())
}

pub fn run() {
    #[cfg(windows)]
    if let Some(p) = read_proxy() {
        let p = if p.starts_with("http") {
            p
        } else {
            format!("http://{p}")
        };
        std::env::set_var(
            "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
            format!("--proxy-server={p}"),
        );
    }
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tiktok application");
}
