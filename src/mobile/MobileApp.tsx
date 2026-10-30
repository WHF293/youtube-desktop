import { useEffect, useRef, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { useTheme } from "../common/stores/theme";
import { useSettings, REGIONS } from "../common/stores/settings";
import { useHistory } from "../common/stores/history";
import { refreshChannelsMeta } from "../common/stores/subsFeed";
import { initDownloads, useDownloads } from "../common/stores/downloads";
import { useVideoFullscreen } from "../common/stores/videoFullscreen";
import { usePlaylist } from "../common/stores/playlist";
import GlassTabBar from "./components/GlassTabBar";
import NavigationRail from "./components/NavigationRail";
import MobileNavBar from "./components/MobileNavBar";
import RegionSheet from "./components/RegionSheet";
import BottomSheet from "./components/BottomSheet";
import Icon, { YouTubeLogo } from "../common/components/Icon";
import HomeView from "./views/Home";
import CategoriesView from "./views/Categories";
import SubscriptionsView from "./views/Subscriptions";
import WatchView from "./views/Watch";
import SearchView from "./views/Search";
import HistoryView from "./views/History";
import WatchLaterView from "./views/WatchLater";
import FavoritesView from "./views/Favorites";
import MeView from "./views/Me";
import OfflineView from "./views/Offline";
import OfflineWatchView from "./views/OfflineWatch";
import ChannelView from "./views/Channel";
import PlaylistView from "./views/Playlist";
import ChannelManageView from "./views/ChannelManage";

/** 底部 Tab 根路由（TabBar 高亮与 Android 返回的「根页」判定共用）。
 *  根路径 "/" 重定向到 /subscriptions（打开软件默认进订阅，2026-10-30 王总指定），
 *  推荐/分类拆分独立路由，待看降为「我的」下的二级入口（2026-10-31） */
const TAB_PATHS = new Set(["/home", "/subscriptions", "/categories", "/me"]);

/** TabBar 高亮映射：/search、/offline、/watchlater、/subscriptions/manage 归属位（首页 / 我的 / 订阅） */
function activeTabOf(pathname: string): string {
  if (TAB_PATHS.has(pathname)) return pathname;
  if (pathname.startsWith("/subscriptions")) return "/subscriptions";
  if (
    pathname.startsWith("/search") ||
    pathname === "/history" ||
    pathname === "/favorites" ||
    pathname === "/watchlater"
  )
    return "/me";
  if (pathname.startsWith("/offline")) return "/me";
  return "/home";
}

export default function MobileApp() {
  const theme = useTheme((s) => s.theme);
  const navigate = useNavigate();
  const location = useLocation();
  const [popularRegionOpen, setPopularRegionOpen] = useState(false);
  const [categoryRegionOpen, setCategoryRegionOpen] = useState(false);
  // 历史全部清除确认 sheet（历史页 navbar 右上角入口）
  const [histClearOpen, setHistClearOpen] = useState(false);
  const activeCount = useDownloads((s) => s.tasks.filter((t) => t.status === "downloading" || t.status === "muxing").length);
  // 当前地区名（推荐/分类页 navbar 地区 icon 边上显示，弹层修改后实时联动）
  const popularRegionCode = useSettings((s) => s.popularRegionCode);
  const categoryRegionCode = useSettings((s) => s.regionCode);
  const popularRegionName = REGIONS.find(([code]) => code === popularRegionCode)?.[1] ?? popularRegionCode;
  const categoryRegionName = REGIONS.find(([code]) => code === categoryRegionCode)?.[1] ?? categoryRegionCode;
  // 观看页沉浸式：隐藏 TabBar（UI 稿 A1）
  const immersive = location.pathname.startsWith("/watch/");
  const pathname = location.pathname;
  // 播放列表详情顶栏文案（博主名-列表名，2026-10-30 王总指定；数据来自 playlist store）
  const plTitle = usePlaylist((s) => s.title);
  const plChannelTitle = usePlaylist((s) => s.channelTitle);
  // 二级页（入口不在 TabBar：搜索/历史/收藏/订阅管理/离线/博主详情等）：
  // 手机档隐藏 TabBar（pad 竖屏走手机样式但保持显示，由 mobile.css 媒体查询按宽度分流）
  const secondary = !immersive && !TAB_PATHS.has(pathname);

  // 明暗模式：class 挂在 <html> 上（与桌面同款 theme store）
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // 代理：移动端固定直连（Android 真机无本机代理可用），启动即清掉历史遗留的
  // persist 代理配置（PC 端默认 127.0.0.1:7897 在手机上必失败），设置页不再提供代理入口
  useEffect(() => {
    const s = useSettings.getState();
    if (s.proxy !== "") s.setProxy("");
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

  // Android 返回键 = WebView history 后退（@tauri-apps/api 2.x 无 onBackPressed API，
  // 此前经运行时探测注册的实现从未生效，2026-10-30 实测全屏返回直接退页后废弃）。
  // 「全屏先退全屏」的守卫在 WatchView 内实现（history 守卫条目 + popstate 监听）；
  // 这里只做兜底：全屏已退出但仍停在守卫条目上（如全屏中点相关视频 push 跳走）时，
  // popstate 自动再退一层跳过守卫条目，避免「按一次返回没反应」。
  useEffect(() => {
    const onPop = () => {
      const st = window.history.state as { usr?: { fsGuard?: boolean } } | null;
      if (st?.usr?.fsGuard && !useVideoFullscreen.getState().active) navigate(-1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [navigate]);

  // 滚动位置记忆：scroll 事件持续把当前页 scrollTop 写进 ref，路由切换时恢复——
  // 首页等列表页返回不再回到顶部（配合去掉路由 key，列表不重挂载不重载）。
  // 注意不能在路由切换的 effect 里才读 scrollTop：那时新路由内容已渲染、
  // 旧 scrollTop 已被浏览器重置为 0
  const scrollMem = useRef(new Map<string, number>());
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    const sc = document.getElementById("m-scroll");
    if (!sc) return;
    const onScroll = () => {
      scrollMem.current.set(pathnameRef.current, sc.scrollTop);
    };
    sc.addEventListener("scroll", onScroll, { passive: true });
    return () => sc.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    pathnameRef.current = pathname;
    const sc = document.getElementById("m-scroll");
    if (sc) sc.scrollTop = scrollMem.current.get(pathname) ?? 0;
  }, [pathname]);

  // 顶部 NavBar（对照 UI 稿 A0/A2/A4/A5）：Tab 页标题栏 + 二级页离线返回栏。
  // 观看页（沉浸无栏）/ 搜索页（自带搜索栏 sticky）/ 频道页（自带返回栏，标题随频道加载）/
  // 离线观看（播放器全宽）不渲染
  const navBar =
    pathname !== "/search" &&
    !pathname.startsWith("/channel/") &&
    !pathname.startsWith("/offline/watch/") ? (
      <MobileNavBar
        title={
          pathname.startsWith("/offline") ? (
            <span>离线下载</span>
          ) : pathname === "/subscriptions/manage" ? (
            <span>订阅管理</span>
          ) : pathname === "/categories" ? (
            <span>分类</span>
          ) : pathname === "/subscriptions" ? (
            <span>订阅</span>
          ) : pathname === "/history" ? (
            <span>历史</span>
          ) : pathname === "/favorites" ? (
            <span>收藏</span>
          ) : pathname === "/watchlater" ? (
            <span>待看</span>
          ) : pathname === "/me" ? (
            <span>我的</span>
          ) : pathname.startsWith("/playlist/") ? (
            /* 播放列表详情：博主名-列表名（王总 2026-10-30 指定），数据来自 playlist store */
            <span className="truncate">
              {plChannelTitle && plTitle ? `${plChannelTitle}-${plTitle}` : plTitle || "播放列表"}
            </span>
          ) : pathname.startsWith("/watch/") ? (
            <span>视频详情</span>
          ) : (
            /* 首页（/home）显示品牌位；根路径 "/" 已重定向到订阅页 */
            <span className="flex items-center gap-1.5">
              <YouTubeLogo size={22} />
              YouTube Desktop
            </span>
          )
        }
        left={
          // 二级页（离线下载 / 历史 / 待看 / 订阅管理 / 视频详情 / 播放列表详情）带返回箭头；根 Tab 页无。
          // 待看已从 TabBar 降为「我的」下的二级入口（2026-10-31），同样归二级页
          pathname.startsWith("/offline") ||
          pathname === "/history" ||
          pathname === "/favorites" ||
          pathname === "/watchlater" ||
          pathname.startsWith("/watch/") ||
          pathname.startsWith("/playlist/") ||
          pathname.startsWith("/subscriptions/") ? (
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
          pathname === "/subscriptions" ? (
            <button
              type="button"
              aria-label="订阅管理"
              onClick={() => navigate("/subscriptions/manage")}
              className="m-nav__icon"
            >
              <Icon name="grip" size={19} />
            </button>
          ) : pathname === "/subscriptions/manage" ? (
            <button
              type="button"
              aria-label="添加频道"
              onClick={() => window.dispatchEvent(new CustomEvent("m-manage-add"))}
              className="m-nav__icon"
            >
              <Icon name="plus" size={19} />
            </button>
          ) : pathname === "/watchlater" ? (
            <button
              type="button"
              aria-label="排序方式"
              onClick={() => window.dispatchEvent(new CustomEvent("m-watchlater-sort"))}
              className="m-nav__icon"
            >
              <Icon name="filter" size={19} />
            </button>
          ) : pathname === "/history" ? (
            <button
              type="button"
              aria-label="全部清除观看记录"
              onClick={() => setHistClearOpen(true)}
              className="m-nav__icon"
            >
              <Icon name="close" size={19} />
            </button>
          ) : pathname === "/home" ? (
            <>
              {/* 地区在左、搜索在右（2026-10-30 王总指定互换）；推荐地区独立设置 */}
              <button
                type="button"
                aria-label="推荐地区设置"
                onClick={() => setPopularRegionOpen(true)}
                className="m-nav__icon flex-row items-center gap-1"
              >
                <span className="max-w-[52px] truncate text-[11px] font-semibold text-ink-2">
                  {popularRegionName}
                </span>
                <Icon name="language" size={19} />
              </button>
              <button
                type="button"
                aria-label="搜索"
                onClick={() => navigate("/search")}
                className="m-nav__icon"
              >
                <Icon name="search" size={19} />
              </button>
            </>
          ) : pathname === "/categories" ? (
            <button
              type="button"
              aria-label="分类地区设置"
              onClick={() => setCategoryRegionOpen(true)}
              className="m-nav__icon flex-row items-center gap-1"
            >
              <span className="max-w-[52px] truncate text-[11px] font-semibold text-ink-2">
                {categoryRegionName}
              </span>
              <Icon name="language" size={19} />
            </button>
          ) : pathname === "/me" ? (
            <button
              type="button"
              aria-label={theme === "dark" ? "切换亮色模式" : "切换暗色模式"}
              onClick={() => useTheme.getState().toggle()}
              className="m-nav__icon"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
            </button>
          ) : undefined
        }
      />
    ) : null;

  return (
    <div className="m-root">
      {/* 地区设置 sheet（推荐/分类页 navbar 地球图标分别唤起，scope 独立） */}
      <RegionSheet open={popularRegionOpen} onClose={() => setPopularRegionOpen(false)} scope="popular" />
      <RegionSheet open={categoryRegionOpen} onClose={() => setCategoryRegionOpen(false)} scope="category" />

      {/* 历史全部清除二次确认（历史页 navbar 右上角） */}
      <BottomSheet open={histClearOpen} onClose={() => setHistClearOpen(false)} title="全部清除">
        <p className="mb-4 text-[13px] leading-relaxed text-ink-2">
          确认清除全部观看记录？该操作不可恢复（仅本地数据，不影响账号）。
        </p>
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => setHistClearOpen(false)}
            className="m-glass-btn flex-1 justify-center"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              void useHistory.getState().clearAll();
              setHistClearOpen(false);
            }}
            className="flex-1 rounded-full bg-red-500 py-2 text-[13px] font-bold text-white"
          >
            全部清除
          </button>
        </div>
      </BottomSheet>
      {/* 大屏（≥840）侧边导航：wide 档取代底部 TabBar（UI 稿 A2/A3），<840 由 .m-rail CSS 隐藏 */}
      {!immersive && <NavigationRail active={activeTabOf(pathname)} badge={activeCount} />}
      <div className="m-main">
        {navBar}
        <div
          id="m-scroll"
          className={`m-body${secondary ? " m-body--secondary" : ""}`}
          style={immersive ? { paddingBottom: 12 } : undefined}
        >
          <Routes>
            {/* 根路径默认进订阅页（打开软件默认 tab，2026-10-30 王总指定）；推荐/分类各自独立路由 */}
            <Route path="/" element={<Navigate to="/subscriptions" replace />} />
            <Route path="/home" element={<HomeView />} />
            <Route path="/categories" element={<CategoriesView />} />
            <Route path="/subscriptions" element={<SubscriptionsView />} />
            <Route path="/subscriptions/manage" element={<ChannelManageView />} />
            <Route path="/watch/:videoId" element={<WatchView />} />
            <Route path="/channel/:channelId" element={<ChannelView />} />
            <Route path="/playlist/:playlistId" element={<PlaylistView />} />
            <Route path="/search" element={<SearchView />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="/favorites" element={<FavoritesView />} />
            <Route path="/watchlater" element={<WatchLaterView />} />
            <Route path="/me" element={<MeView />} />
            <Route path="/offline" element={<OfflineView />} />
            <Route path="/offline/watch/:videoId" element={<OfflineWatchView />} />
            <Route path="*" element={<Navigate to="/subscriptions" replace />} />
          </Routes>
        </div>
      </div>
      {!immersive && (
        <GlassTabBar
          active={activeTabOf(pathname)}
          badge={activeCount}
          secondary={secondary}
          onSelect={(to) => navigate(to)}
        />
      )}
    </div>
  );
}
