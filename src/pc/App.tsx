import { useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import TitleBar from "./components/TitleBar";
import Sidebar from "./components/Sidebar";
import InfoPin from "../common/components/InfoPin";
import Home from "./pages/Home";
import Search from "./pages/Search";
import Watch from "./pages/Watch";
import Channel from "./pages/Channel";
import Subscriptions from "./pages/Subscriptions";
import Groups from "./pages/Groups";
import Favorites from "./pages/Favorites";
import History from "./pages/History";
import WatchLater from "./pages/WatchLater";
import Offline from "./pages/Offline";
import OfflineWatch from "./pages/OfflineWatch";
import Help from "./pages/Help";
import Settings from "./pages/Settings";
import { useTheme } from "../common/stores/theme";
import { useVideos } from "../common/stores/videos";
import { useSettings } from "../common/stores/settings";
import { NEWS_CATEGORY_ID } from "../common/lib/youtube";
import { useHistory } from "../common/stores/history";
import { refreshChannelsMeta } from "../common/stores/subsFeed";
import { initDownloads } from "../common/stores/downloads";

export default function App() {
  const theme = useTheme((s) => s.theme);
  const videosStatus = useVideos((s) => s.status);
  const loadPopular = useVideos((s) => s.loadPopular);
  const regionCode = useSettings((s) => s.regionCode);
  const location = useLocation();
  const prevRegion = useRef(regionCode);

  // 明暗模式：class 挂在 <html> 上
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 地区变化：正处在首页时立刻刷新「全部」（地区频道组）与「新闻」分类（搜索地区化）；
  // 其余分类为全球精选频道组，与地区无关不刷新
  useEffect(() => {
    if (prevRegion.current === regionCode) return;
    prevRegion.current = regionCode;
    if (location.pathname === "/") {
      const { category } = useVideos.getState();
      if (!category || category === NEWS_CATEGORY_ID) void loadPopular(category);
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

  // 屏蔽 WebView 原生右键菜单（自绘应用不需要「返回/刷新/打印」菜单）；
  // 输入框/文本域保留原生菜单以便复制粘贴，博主卡片右键走自绘菜单
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  // 博主元数据后台自愈：启动即拉取全部博主的头像/标题（覆盖本地数据缺失或损坏的场景，
  // 结果持久化，失败静默下次再试）
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

  // 返回上一页统一由 TitleBar 承担：非首页导航栏左侧固定返回箭头，
  // 这里不再渲染页内返回条（避免双返回入口）

  // 首次进入预热首页数据
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
          <div id="main-scroll" className="min-h-0 flex-1 overflow-y-auto" key={location.pathname}>
            <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Navigate to="/" replace />} />
            <Route path="/trending" element={<Navigate to="/" replace />} />
            <Route path="/search" element={<Search />} />
            <Route path="/watch/:videoId" element={<Watch />} />
            <Route path="/channel/:channelId" element={<Channel />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/history" element={<History />} />
            <Route path="/watchlater" element={<WatchLater />} />
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
