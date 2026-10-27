// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 主体在 lib.rs（tauri android build 要求 lib target）；此处仅 Windows 桌面入口
fn main() {
    youtube_desktop_lib::run()
}
