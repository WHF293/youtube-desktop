import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import InfoPin from "./components/InfoPin";
import Icon from "./components/Icon";
import Home from "./pages/Home";
import Trending from "./pages/Trending";
import Search from "./pages/Search";
import Watch from "./pages/Watch";
import Channel from "./pages/Channel";
import Subscriptions from "./pages/Subscriptions";
import Groups from "./pages/Groups";
import Favorites from "./pages/Favorites";
import History from "./pages/History";
import Offline from "./pages/Offline";
import OfflineWatch from "./pages/OfflineWatch";
import Help from "./pages/Help";
import Settings from "./pages/Settings";
import { useTheme } from "./stores/theme";
import { useVideos } from "./stores/videos";
import { useSettings } from "./stores/settings";
import { useHistory } from "./stores/history";
import { initDownloads } from "./stores/downloads";

export default function App() {
  const theme = useTheme((s) => s.theme);
  const videosStatus = useVideos((s) => s.status);
  const loadPopular = useVideos((s) => s.loadPopular);
  const regionCode = useSettings((s) => s.regionCode);
  const location = useLocation();
  const navigate = useNavigate();
  const prevRegion = useRef(regionCode);

  // 明暗模式：class 挂在 <html> 上
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 地区变化：正处在首页/热门时立刻按新地区的频道组刷新「全部」数据
  useEffect(() => {
    if (prevRegion.current === regionCode) return;
    prevRegion.current = regionCode;
    if (location.pathname === "/" || location.pathname === "/trending") {
      const { category } = useVideos.getState();
      if (!category) void loadPopular(); // 分类 tab 的频道组与地区无关，不刷新
    }
  }, [regionCode, location.pathname, loadPopular]);

  // 把当前 proxy 同步到 Rust 侧落盘（下次启动 WebView 按 --proxy-server 挂代理，
  // 视频 iframe 播放依赖它）；API/图片请求的代理是即时生效的，无需重启。
  useEffect(() => {
    if (!isTauri()) return;
    invoke("save_webview_proxy", { proxy: useSettings.getState().proxy }).catch(() => {});
  }, []);

  // 观看记录：打开应用即清理 7 天前的记录（SQLite）
  useEffect(() => {
    void useHistory.getState().init();
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

  // 是否有可返回的上一页（React Router 在 history.state.idx 记录栈深）；
  // 仅二级页显示返回按钮——侧栏有入口的页面不显示
  const TOP_LEVEL_PATHS = new Set(["/", "/trending", "/subscriptions", "/history", "/favorites", "/offline"]);
  const canGoBack =
    (window.history.state?.idx ?? 0) > 0 && !TOP_LEVEL_PATHS.has(location.pathname);

  // 首次进入预热热门数据（Home / Trending 共用）
  useEffect(() => {
    if (videosStatus === "idle") void loadPopular();
  }, [videosStatus, loadPopular]);

  return (
    <div className="flex h-full flex-col bg-app text-ink">
      <TitleBar />
      {/* Islands 布局（参考 whf-stock-board）：p-2.5 露出画布底色、gap-2.5 是岛间隙；
          侧栏与主区各自为独立浮岛（rounded-2xl + shadow-island），标题栏不岛化保持通栏 */}
      <div className="flex min-h-0 flex-1 gap-2.5 p-2.5">
        <Sidebar />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-island">
          {/* 返回上一页：二级/三级页面（观看、频道、搜索、额度等）顶部细页头，
              仅历史栈里存在 back 记录时显示 */}
          {canGoBack && (
            <div className="flex h-10 shrink-0 items-center border-b border-line px-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="返回上一页"
                title="返回上一页"
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:bg-flat hover:text-ink"
              >
                <Icon name="arrowLeft" size={16} />
                返回
              </button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto" key={location.pathname}>
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/trending" element={<Trending />} />
            <Route path="/search" element={<Search />} />
            <Route path="/watch/:videoId" element={<Watch />} />
            <Route path="/channel/:channelId" element={<Channel />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/history" element={<History />} />
            <Route path="/offline" element={<Offline />} />
            <Route path="/offline/watch/:videoId" element={<OfflineWatch />} />
            <Route path="/help" element={<Help />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      <InfoPin />
    </div>
  );
}
