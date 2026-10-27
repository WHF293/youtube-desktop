import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useTheme } from "../common/stores/theme";
import { useSettings } from "../common/stores/settings";
import { useHistory } from "../common/stores/history";
import { refreshChannelsMeta } from "../common/stores/subsFeed";
import { initDownloads, useDownloads } from "../common/stores/downloads";
import GlassTabBar from "./components/GlassTabBar";
import HomeView from "./views/Home";
import SubscriptionsView from "./views/Subscriptions";
import WatchView from "./views/Watch";
import SearchView from "./views/Search";
import HistoryView from "./views/History";
import WatchLaterView from "./views/WatchLater";
import MeView from "./views/Me";

/** 底部 Tab 根路由（TabBar 高亮与 Android 返回的「根页」判定共用） */
const TAB_PATHS = new Set(["/", "/subscriptions", "/history", "/watchlater", "/me"]);

/** TabBar 高亮映射：/search 归首页位（UI 稿 A3 结果态） */
function activeTabOf(pathname: string): string {
  if (TAB_PATHS.has(pathname)) return pathname;
  if (pathname.startsWith("/search")) return "/";
  return "/";
}

export default function MobileApp() {
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();
  const location = useLocation();
  const activeCount = useDownloads((s) => s.tasks.filter((t) => t.status === "downloading" || t.status === "muxing").length);
  // 观看页沉浸式：隐藏 TabBar（UI 稿 A1）
  const immersive = location.pathname.startsWith("/watch/");

  // 明暗模式：class 挂在 <html> 上（与桌面同款 theme store）
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 代理落盘：移动端 Android WebView 不支持 --proxy-server 注入（Rust 侧 cfg 降级为空实现），
  // 保留调用保证双端命令通道一致，reqwest 层代理由设置即时生效
  useEffect(() => {
    if (!isTauri()) return;
    invoke("save_webview_proxy", { proxy: useSettings.getState().proxy }).catch(() => {});
  }, []);

  // 观看记录：打开应用即清理 7 天前的记录（SQLite）
  useEffect(() => {
    void useHistory.getState().init();
  }, []);

  // 博主元数据后台自愈（与桌面一致）
  useEffect(() => {
    void refreshChannelsMeta();
  }, []);

  // 下载进度事件 + 启动时把上次未完成的任务标记为失败
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void initDownloads().then((u) => {
      if (disposed) u();
      else unlisten = u;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  // Android 系统返回手势/返回键桥接：二级页 = 路由后退（拦截默认退出）；
  // 根 Tab 页放行默认行为（交还系统，通常是最小化/退出）。
  // API 经运行时探测（try/catch + typeof），桌面/旧内核静默跳过。【待真机验证】
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const win = getCurrentWebviewWindow();
        const onBackPressed = (
          win as unknown as {
            onBackPressed?: (handler: () => boolean) => Promise<() => void>;
          }
        ).onBackPressed;
        if (typeof onBackPressed !== "function") return;
        unlisten = await onBackPressed.call(win, () => {
          if (TAB_PATHS.has(location.pathname)) return true;
          navigate(-1);
          return false;
        });
      } catch {
        // 桌面端 / 旧版 API 无此能力，忽略
      }
    })();
    return () => unlisten?.();
  }, [location.pathname, navigate]);

  return (
    <div className="m-root">
      <div
        id="m-scroll"
        className="m-body"
        key={location.pathname}
        style={immersive ? { paddingBottom: 12 } : undefined}
      >
        <Routes>
          <Route path="/" element={<HomeView />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/subscriptions" element={<SubscriptionsView />} />
          <Route path="/watch/:videoId" element={<WatchView />} />
          <Route path="/search" element={<SearchView />} />
          <Route path="/history" element={<HistoryView />} />
          <Route path="/watchlater" element={<WatchLaterView />} />
          <Route path="/me" element={<MeView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {!immersive && (
        <GlassTabBar
          active={activeTabOf(location.pathname)}
          badge={activeCount}
          onSelect={(to) => navigate(to)}
        />
      )}
    </div>
  );
}
