import { isTauri } from "@tauri-apps/api/core";

/**
 * 用系统默认浏览器打开外部链接。
 * 桌面端走 tauri-plugin-opener；网页端直接 window.open。
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
