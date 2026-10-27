import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Icon, { YouTubeLogo } from "../../common/components/Icon";
import SearchModal from "./SearchModal";
import { useUi } from "../../common/stores/ui";
import { useTheme } from "../../common/stores/theme";
import { checkForUpdate, currentVersion, downloadAndInstall, type UpdateInfo } from "../../common/lib/updater";

/**
 * 版本号标签（TitleBar 左侧品牌旁）：显示当前版本 vX.Y.Z；
 * 点击检查更新——已是最新短暂提示，有新版本则再次点击触发
 * 「下载（进度实时显示）→ 静默安装 → 自动重启」。仅桌面端显示。
 */
function VersionTag() {
  const [ver, setVer] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "latest" | "available" | "downloading" | "error">("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!isTauri()) return;
    currentVersion().then((v) => setVer(v)).catch(() => setVer(""));
  }, []);

  // 已是最新/出错的提示 2.5s 后复位
  useEffect(() => {
    if (state !== "latest" && state !== "error") return;
    const t = setTimeout(() => {
      setState("idle");
      setErrorMsg("");
    }, 2500);
    return () => clearTimeout(t);
  }, [state]);

  const onClick = async () => {
    if (!isTauri() || state === "checking" || state === "downloading") return;
    if (state === "available" && info) {
      // 第二次点击：下载并安装，完成后应用自动退出重启
      setState("downloading");
      setProgress(0);
      try {
        await downloadAndInstall(info, (downloaded, total) => {
          setProgress(total > 0 ? Math.floor((downloaded / total) * 100) : 0);
        });
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        setState("error");
      }
      return;
    }
    // 检查更新
    setState("checking");
    try {
      const update = await checkForUpdate();
      if (update) {
        setInfo(update);
        setState("available");
      } else {
        setState("latest");
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  };

  if (!isTauri() || !ver) return null;

  const label =
    state === "checking" ? "检查中…"
    : state === "latest" ? "已是最新"
    : state === "available" ? `发现 v${info?.latest} · 点击更新`
    : state === "downloading" ? `下载中 ${progress}%…`
    : state === "error" ? (errorMsg || "检查失败")
    : `v${ver}`;

  const highlight =
    state === "available" || state === "downloading" ? "text-accent"
    : state === "error" ? "text-accent"
    : state === "latest" ? "text-green-600 dark:text-green-500"
    : "text-ink-3";

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      title={`当前版本 v${ver}，点击检查更新`}
      className={`ml-1 shrink-0 rounded px-2 py-0.5 text-xs transition-colors hover:bg-flat ${highlight}`}
    >
      {label}
    </button>
  );
}

/**
 * 自绘标题栏（参照 whf-stock-board 的 TitleBar 模式）：
 * - 拖拽 / 双击最大化由 onMouseDown / onDoubleClick 手动接管
 *   （startDragging / toggleMaximize IPC），按钮以外的空白都能拖；
 * - 左侧：品牌 + 版本号（点击检查更新/下载安装）+ 侧栏开关；
 * - 右侧工具条：搜索（弹窗）/ 明暗主题 / 使用说明 + 窗口控制按钮；
 * - 搜索走 DocSearch 风格弹窗（SearchModal），Ctrl+K 呼出。
 */

export default function TitleBar() {
  const navigate = useNavigate();
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const { theme, toggle: toggleTheme } = useTheme();

  const [searchOpen, setSearchOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const canControlWindow = isTauri();
  const appWindow = canControlWindow ? getCurrentWindow() : null;

  // Ctrl+K 全局呼出搜索弹窗（DocSearch 惯例）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!appWindow) return;
    const sync = () => {
      appWindow.isMaximized().then(setIsMaximized).catch(() => {});
    };
    sync();
    const promise = appWindow.onResized(sync);
    return () => {
      promise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, [appWindow]);

  /**
   * 手动拖拽：不依赖 Tauri 注入的 data-tauri-drag-region 命中逻辑——
   * 那套要求 mousedown 恰好落在带属性的元素上，标题栏各段被布局元素
   * 覆盖后可拖区域极小。这里统一接管：按住标题栏任意
   * 非交互区域（按钮/输入框除外）即可拖动；双击 = 最大化/还原。
   */
  const isInteractive = (el: HTMLElement) =>
    Boolean(el.closest("button, input, textarea, select, a, [role='button']"));

  const onDragStart = (e: React.MouseEvent) => {
    if (!appWindow || e.button !== 0) return;
    if (isInteractive(e.target as HTMLElement)) return;
    e.preventDefault();
    void appWindow.startDragging();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!appWindow) return;
    if (isInteractive(e.target as HTMLElement)) return;
    void appWindow.toggleMaximize();
  };

  return (
    <>
    <header
      onMouseDown={onDragStart}
      onDoubleClick={onDoubleClick}
      className="flex h-9 shrink-0 select-none items-center justify-between border-b border-line bg-surface pl-3"
    >
      {/* 左侧：品牌 + 侧栏开关 */}
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={() => navigate("/")}
          aria-label="回到首页"
          className="flex min-w-0 cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-flat"
        >
          <YouTubeLogo size={20} />
          <span className="truncate text-sm font-semibold text-ink">YouTube Desktop</span>
        </button>
        <VersionTag />
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="切换侧栏"
          title="切换侧栏"
          className="flex shrink-0 items-center justify-center rounded p-1.5 text-ink-2 hover:bg-flat hover:text-ink"
        >
          <Icon name="menu" size={18} />
        </button>
      </div>

      {/* 中部：留给窗口拖拽的空白区（无内容） */}

      {/* 右侧：搜索弹窗 + 主题切换 + 设置 + 窗口控制 */}
      <div className="flex h-full shrink-0 items-stretch">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="搜索"
          title="搜索（Ctrl+K）"
          className="flex w-11 items-center justify-center text-ink-2 hover:bg-flat hover:text-ink"
        >
          <Icon name="search" size={16} />
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
          title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
          className="flex w-11 items-center justify-center text-ink-2 hover:bg-flat hover:text-ink"
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
        </button>
        <button
          type="button"
          onClick={() => navigate("/help")}
          aria-label="使用说明"
          title="使用说明"
          className="flex w-11 items-center justify-center text-ink-2 hover:bg-flat hover:text-ink"
        >
          <Icon name="book" size={16} />
        </button>

        {/* 窗口控制按钮（浏览器预览时禁用） */}
        <button
          type="button"
          aria-label="最小化"
          disabled={!canControlWindow}
          className="flex w-11 items-center justify-center text-ink-2 hover:bg-flat hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => appWindow?.minimize()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1 6h10" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={isMaximized ? "还原" : "最大化"}
          disabled={!canControlWindow}
          className="flex w-11 items-center justify-center text-ink-2 hover:bg-flat hover:text-ink disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => appWindow?.toggleMaximize()}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="3.5" y="1.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
              <path d="M8.5 10.5h-7v-7" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" fill="none" />
            </svg>
          )}
        </button>
        <button
          type="button"
          aria-label="关闭"
          disabled={!canControlWindow}
          className="flex w-11 items-center justify-center text-ink-2 hover:bg-[#e81123] hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
          onClick={() => appWindow?.close()}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M1.5 1.5l9 9M10.5 1.5l-9 9" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
      </div>
    </header>

    {/* 全局搜索弹窗（渲染在 header 之外，fixed 遮罩全屏） */}
    <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
