import { useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { openExternal } from "../../common/lib/open";

/** TikTok 页：打开官网独立窗口（iframe 内嵌被官网软拦截——永久卡 loading，实测废弃）。
 *  独立窗口里浏览/搜索/关注/登录均为官方功能，地区跟随代理出口节点。
 *  命令失败（如 Android 单窗口限制）时回退系统浏览器 */
// 模块级去重：StrictMode 双触发 effect / 手速连点时只开一个窗口
let opening: Promise<void> | null = null;

function openOnce(setError: (s: string) => void): Promise<void> {
  if (opening) return opening;
  opening = (async () => {
    if (!isTauri()) {
      void openExternal("https://www.tiktok.com/foryou");
      return;
    }
    try {
      await invoke("open_tiktok_window");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void openExternal("https://www.tiktok.com/foryou");
    }
  })().finally(() => {
    opening = null;
  });
  return opening;
}

export default function TikTokEmbed() {
  const [error, setError] = useState("");

  const open = () => void openOnce(setError);

  useEffect(() => {
    void openOnce(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-ink">TikTok 官网已在独立窗口打开</p>
      <p className="max-w-md text-xs leading-relaxed text-ink-3">
        浏览/搜索/关注/登录均为官方功能；地区跟随代理出口节点（换节点即换地区）。
        关掉窗口后点下方按钮重开。
      </p>
      {error && <p className="max-w-md text-xs text-accent">{error}</p>}
      <button type="button" onClick={() => void open()} className="rounded-full glass-btn px-4 py-1.5 text-sm text-ink">
        重新打开窗口
      </button>
      <button
        type="button"
        onClick={() => void openExternal("https://www.tiktok.com/foryou")}
        className="rounded-full px-4 py-1.5 text-xs text-ink-3 hover:text-ink"
      >
        在系统浏览器打开
      </button>
    </div>
  );
}
