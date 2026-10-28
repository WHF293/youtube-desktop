import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { useTheme } from "../common/stores/theme";
import { useSettings } from "../common/stores/settings";
import { useHistory } from "../common/stores/history";
import { refreshChannelsMeta } from "../common/stores/subsFeed";
import { initDownloads, useDownloads } from "../common/stores/downloads";
import GlassTabBar from "./components/GlassTabBar";
import NavigationRail from "./components/NavigationRail";
import MobileNavBar from "./components/MobileNavBar";
import Icon, { YouTubeLogo } from "../common/components/Icon";
import HomeView from "./views/Home";
import SubscriptionsView from "./views/Subscriptions";
import WatchView from "./views/Watch";
import SearchView from "./views/Search";
import HistoryView from "./views/History";
import WatchLaterView from "./views/WatchLater";
import MeView from "./views/Me";
import OfflineView from "./views/Offline";
import OfflineWatchView from "./views/OfflineWatch";
import ChannelView from "./views/Channel";

/** 底部 Tab 根路由（TabBar 高亮与 Android 返回的「根页」判定共用） */
const TAB_PATHS = new Set(["/", "/subscriptions", "/watchlater", "/me"]);

/** TabBar 高亮映射：/search、/offline 归属位（首页 / 我的） */
function activeTabOf(pathname: string): string {
  if (TAB_PATHS.has(pathname)) return pathname;
  if (pathname.startsWith("/search") || pathname === "/history") return "/me";
  if (pathname.startsWith("/offline")) return "/me";
  return "/";
}

export default function MobileApp() {
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();
  const location = useLocation();
  const activeCount = useDownloads((s) => s.tasks.filter((t) => t.status === "downloading" || t.status === "muxing").length);
  // 观看页沉浸式：隐藏 TabBar（UI 稿 A1）
  const immersive = location.pathname.startsWith("/watch/");
  const pathname = location.pathname;

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

  // 下载目录：移动端固定 app data dir/offline（Android 私有存储免权限申请），
  // 每次启动覆盖（移动端无目录选择入口；桌面默认 C:/download/youtube 不受影响）
  useEffect(() => {
    if (!isTauri()) return;
    void appDataDir().then((base) => {
      const dir = `${base.replace(/[\\/]+$/, "")}/offline`;
      if (useSettings.getState().downloadDir !== dir) {
        useSettings.getState().setDownloadDir(dir);
      }
    });
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

  // 顶部 NavBar（对照 UI 稿 A0/A2/A4/A5）：Tab 页标题栏 + 二级页离线返回栏。
  // 观看页（沉浸无栏）/ 搜索页（自带搜索栏 sticky）/ 频道页（自带返回栏，标题随频道加载）/
  // 离线观看（播放器全宽）不渲染
  const navBar =
    !immersive &&
    pathname !== "/search" &&
    !pathname.startsWith("/channel/") &&
    !pathname.startsWith("/offline/watch/") ? (
      <MobileNavBar
        title={
          pathname.startsWith("/offline") ? (
            <span>离线下载</span>
          ) : pathname === "/subscriptions" ? (
            <span>订阅</span>
          ) : pathname === "/history" ? (
            <span>历史</span>
          ) : pathname === "/watchlater" ? (
            <span>待看</span>
          ) : pathname === "/me" ? (
            <span>我的</span>
          ) : (
            <span className="flex items-center gap-1.5">
              <YouTubeLogo size={22} />
              YouTube Desktop
            </span>
          )
        }
        left={
          pathname.startsWith("/offline") ? (
            <button
              type="button"
              aria-label="返回"
              onClick={() => navigate(-1)}
              className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-ink-2"
            >
              ‹
            </button>
          ) : undefined
        }
        right={
          pathname === "/" || pathname === "/me" ? (
            <>
              <button
                type="button"
                aria-label="搜索"
                onClick={() => navigate("/search")}
                className="m-nav__icon"
              >
                <Icon name="search" size={19} />
              </button>
              {pathname === "/" && (
                <button
                  type="button"
                  aria-label="我的"
                  onClick={() => navigate("/me")}
                  className="m-nav__icon"
                >
                  <Icon name="settings" size={19} />
                </button>
              )}
            </>
          ) : undefined
        }
      />
    ) : null;

  return (
    <div className="m-root">
      {/* 大屏（≥840）侧边导航：wide 档取代底部 TabBar（UI 稿 A2/A3），<840 由 .m-rail CSS 隐藏 */}
      {!immersive && <NavigationRail active={activeTabOf(pathname)} badge={activeCount} />}
      <div className="m-main">
        {navBar}
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
            <Route path="/channel/:channelId" element={<ChannelView />} />
            <Route path="/search" element={<SearchView />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="/watchlater" element={<WatchLaterView />} />
            <Route path="/me" element={<MeView />} />
            <Route path="/offline" element={<OfflineView />} />
            <Route path="/offline/watch/:videoId" element={<OfflineWatchView />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      {!immersive && (
        <GlassTabBar
          active={activeTabOf(pathname)}
          badge={activeCount}
          onSelect={(to) => navigate(to)}
        />
      )}
    </div>
  );
}
