import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openExternal } from "../../common/lib/open";

/** 移动端 TikTok 页：打开官网（Android 单窗口限制 → 系统浏览器）。
 *  返回栏由 MobileApp 承担；地区跟随网络出口 */
export default function TikTokEmbedView() {
  useEffect(() => {
    invoke("open_tiktok_window").catch(() => {
      void openExternal("https://www.tiktok.com/foryou");
    });
  }, []);
  return (
    <div className="m-page flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm text-ink-2">TikTok 在系统浏览器中打开</p>
      <button
        type="button"
        onClick={() => void openExternal("https://www.tiktok.com/foryou")}
        className="m-glass-btn px-4 py-1.5 text-xs text-ink"
      >
        重新打开
      </button>
    </div>
  );
}
