import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import { usePlayer } from "../../common/stores/player";
import { useChannels } from "../../common/stores/channels";
import { useWatchLater } from "../../common/stores/watchLater";
import { useVideoNavQueue, toNavEntries, getVideoNavNeighbors } from "../../common/stores/videoNav";
import { bestThumb, formatCount, formatRelativeDate, formatViews, parseDuration, videoIdOf } from "../../common/lib/format";
import PlayerSkeleton from "../../common/components/PlayerSkeleton";
import Icon from "../../common/components/Icon";
import { RowSkeleton } from "../components/VideoCards";
import Img from "../../common/components/Img";
import { AvatarBadge, RowCard } from "../components/VideoCards";
import BottomSheet from "../components/BottomSheet";
import { ErrorState } from "../components/StateViews";
import { FavGroupSheet } from "./History";
import { getVideoFormats, type QualityOption } from "../../common/lib/extract";
import { useFavorites } from "../../common/stores/favorites";
import { useDownloads } from "../../common/stores/downloads";
import { useVideoFullscreen } from "../../common/stores/videoFullscreen";
import { isTauri } from "@tauri-apps/api/core";

/** 移动端观看页：沉浸式无 TabBar。iframe 播放 + 标题 + 频道行（订阅两步确认）+
 *  待看开关 + 相关视频。收藏/下载/评论 M3 接入（BottomSheet 已就位）。 */
export default function WatchView() {
  const { videoId = "" } = useParams();
  const video = usePlayer((s) => s.video);
  const channel = usePlayer((s) => s.channel);
  const related = usePlayer((s) => s.related);
  const relatedStatus = usePlayer((s) => s.relatedStatus);
  const status = usePlayer((s) => s.status);
  const error = usePlayer((s) => s.error);
  const load = usePlayer((s) => s.load);

  const channels = useChannels((s) => s.channels);
  const subscribe = useChannels((s) => s.add);
  const unsubscribe = useChannels((s) => s.remove);
  const wlHas = useWatchLater((s) => s.has);
  const wlAdd = useWatchLater((s) => s.add);
  const wlRemove = useWatchLater((s) => s.remove);

  // 订阅两步确认（删除类二次确认约定，确认态 3 秒自动复位）
  const [confirming, setConfirming] = useState(false);
  const confirmTimer = useRef<number | undefined>(undefined);
  // 轻提示 toast（待看加/移成功反馈，1.8s 自动消失）
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  };
  // 收藏 / 下载弹层
  const [favOpen, setFavOpen] = useState(false);
  const favVideos = useFavorites((s) => s.videos);
  const faved = favVideos.some((v) => v.videoId === videoId);
  const [dlOpen, setDlOpen] = useState(false);
  const [dlLoading, setDlLoading] = useState(false);
  const [dlOptions, setDlOptions] = useState<QualityOption[]>([]);
  const [dlError, setDlError] = useState("");
  const [dlPicked, setDlPicked] = useState<QualityOption | null>(null);
  const enqueue = useDownloads((s) => s.enqueue);
  // 播放器全屏态（自绘按钮接管：Android WebView 里 iframe 播放器自带的全屏按钮无效）
  const fsActive = useVideoFullscreen((s) => s.active);
  const setFsActive = useVideoFullscreen((s) => s.setActive);

  useEffect(() => {
    void load(videoId);
    return () => {
      window.clearTimeout(confirmTimer.current);
    };
  }, [videoId, load]);

  // 注册「相关视频」队列（空列表内部自动跳过）+ 计算上一个/下一个：
  // 从来源列表（首页/搜索/博主页/订阅/待看/收藏/历史/播放列表/相关视频）队列按序切换
  useVideoNavQueue("m-watch-related", toNavEntries(related));
  const nav = useMemo(() => getVideoNavNeighbors(videoId), [videoId]);

  // 全屏态 ↔ 原生桥：进入时强制横屏 + 沉浸系统栏，退出/离开页面时还原。
  // pad 已是横屏时强制横屏为 no-op，效果就是单纯铺满全屏。
  // 桥由 patch-android.mjs 注入，桌面/浏览器开发环境缺失时静默跳过（仅 CSS 铺满）。
  useEffect(() => {
    const bridge = (
      window as unknown as {
        AndroidBridge?: {
          enterVideoFullscreen?: () => void;
          exitVideoFullscreen?: () => void;
        };
      }
    ).AndroidBridge;
    if (typeof bridge?.exitVideoFullscreen !== "function") return;
    if (fsActive) bridge.enterVideoFullscreen?.();
    // cleanup 覆盖两种退出路径：切换 fsActive false、组件卸载（路由跳转/杀页面）
    return () => bridge.exitVideoFullscreen?.();
  }, [fsActive]);

  // 全屏态 Esc 退出（pad 外接键盘场景）
  useEffect(() => {
    if (!fsActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFsActive(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fsActive, setFsActive]);

  // 返回键先退全屏（mobile / pad 竖屏全屏播放时按返回，先回非全屏而非退出详情页，
  // 2026-10-30 王总指定）。原理：Android WebView 返回 = history 后退，而
  // @tauri-apps/api 2.x 无 onBackPressed API（此前 MobileApp 里的注册从未生效）。
  // 进全屏时经 router 压一条同路径守卫条目；返回触发 popstate 时路由弹回守卫前的
  // 条目（同路径、组件不重挂载、iframe 播放不中断），window 监听器只退全屏；
  // 按钮/Esc 退全屏在 cleanup 里把守卫条目弹掉，避免之后按一次返回没反应。
  const navigate = useNavigate();
  const { pathname: watchPath, search: watchSearch } = useLocation();
  useEffect(() => {
    if (!fsActive) return;
    navigate(`${watchPath}${watchSearch}`, { state: { fsGuard: true } });
    const onPop = () => {
      // 返回键：守卫条目已被消费（路由回到守卫前的同路径条目），这里只退全屏
      useVideoFullscreen.getState().setActive(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 守卫未被返回键消费（按钮/Esc 退全屏路径）时弹掉；已被消费（当前条目不是
      // 守卫，如全屏中点相关视频 push 跳走后的卸载）则跳过，残留由 MobileApp 兜底跳过
      const st = window.history.state as { usr?: { fsGuard?: boolean } } | null;
      if (st?.usr?.fsGuard) navigate(-1);
    };
    // navigate 引用稳定（react-router v6），fsActive 是唯一开关
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsActive]);

  if (status === "loading" || status === "idle") {
    return <PlayerSkeleton />;
  }
  if (status === "error" || !video) {
    return (
      <ErrorState desc={error || "视频不存在或已被删除"} onRetry={() => void load(videoId)} />
    );
  }

  const channelId = video.snippet.channelId;
  const subscribed = channels.some((c) => c.id === channelId);
  const inWl = wlHas(videoId);
  const v = channel?.statistics?.subscriberCount;

  const toggleSubscribe = () => {
    if (!subscribed) {
      subscribe(channelId, video.snippet.channelTitle);
      return;
    }
    if (!confirming) {
      setConfirming(true);
      confirmTimer.current = window.setTimeout(() => setConfirming(false), 3000);
      return;
    }
    window.clearTimeout(confirmTimer.current);
    setConfirming(false);
    unsubscribe(channelId);
  };

  const toggleWatchLater = () => {
    if (inWl) {
      // 移出待看同样走两步确认（按钮文字提示）
      if (!confirming) {
        setConfirming(true);
        confirmTimer.current = window.setTimeout(() => setConfirming(false), 3000);
        return;
      }
      window.clearTimeout(confirmTimer.current);
      setConfirming(false);
      wlRemove(videoId);
      showToast("已移出待看");
      return;
    }
    wlAdd({
      videoId,
      title: video.snippet.title,
      channelId,
      channelTitle: video.snippet.channelTitle,
      thumb: bestThumb(video.snippet),
      duration: video.contentDetails?.duration
        ? parseDuration(video.contentDetails.duration)
        : "",
    });
    showToast("已加入待看");
  };

  /** 打开下载 sheet：先提取清晰度（流地址 6h 有效不入盘，重试需重新提取） */
  const openDownloadSheet = () => {
    setDlOpen(true);
    setDlError("");
    setDlPicked(null);
    if (dlOptions.length > 0) return; // 已提取过直接复用（同一次进入页面内有效）
    setDlLoading(true);
    getVideoFormats(videoId)
      .then((r) => setDlOptions(r.options))
      .catch((e) => setDlError(e instanceof Error ? e.message : String(e)))
      .finally(() => setDlLoading(false));
  };

  return (
    <div className="bg-app wide:mx-auto wide:flex wide:w-full wide:max-w-[1440px] wide:items-start wide:gap-4 wide:p-4">
      {/* 轻提示 toast：屏幕下方居中，不遮标题区 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[120px] z-[60] flex justify-center">
          <span className="rounded-full bg-black/80 px-4 py-2 text-[12.5px] font-medium text-white shadow-island">
            {toast}
          </span>
        </div>
      )}
      {/* 主列：播放器 + 标题 + 频道行 + 操作；wide 档为双栏左列（UI 稿 A3） */}
      <div className="wide:min-w-0 wide:flex-[1.6]">
      {/* 播放器：静态 iframe（IFrame API 在 WebView2 实测黑屏，桌面同款方案）；
          Android WebView 无 --proxy-server 注入，挂代理用户画面可能加载不出（见开发方案 §6）。
          全屏态：容器固定铺满视口（z 高于 navbar/toast），iframe 不重挂载、播放不中断；
          横竖屏由原生桥切换（AndroidBridge.enterVideoFullscreen），见上方 effect */}
      <div
        className={
          fsActive
            ? "fixed inset-0 z-[90] bg-black"
            : "relative aspect-video bg-black wide:overflow-hidden wide:rounded-xl"
        }
      >
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&cc_load_policy=1&cc_lang_pref=zh-Hans&hl=zh-CN`}
          title={video.snippet.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        {/* 自绘全屏按钮：YouTube 播放器自带的那颗在 Android WebView 无效，盖在其常驻位上 */}
        <button
          type="button"
          aria-label={fsActive ? "退出全屏" : "全屏播放"}
          onClick={() => setFsActive(!fsActive)}
          className="absolute bottom-2 right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
        >
          <Icon name={fsActive ? "fullscreenExit" : "fullscreen"} size={20} />
        </button>
      </div>

      {/* 标题与统计 */}
      <div className="border-b border-line bg-surface px-3.5 pb-3 pt-3">
        <h1 className="text-[15.5px] font-extrabold leading-[1.45] text-ink">
          {video.snippet.title}
        </h1>
        <p className="mt-1 text-[11.5px] text-ink-2">
          {video.statistics?.viewCount
            ? `${formatViews(video.statistics.viewCount)}次观看`
            : ""}
          {` · ${formatRelativeDate(video.snippet.publishedAt)}`}
        </p>
      </div>

      {/* 频道行：头像 + 订阅按钮（两步确认）；头像/频道名点击进博主主页 */}
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-3.5 py-2.5">
        <Link
          to={`/channel/${channelId}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 active:opacity-70"
          aria-label={`前往 ${video.snippet.channelTitle} 主页`}
        >
          {channel?.snippet?.thumbnails ? (
            <Img
              src={bestThumb(channel.snippet)}
              alt=""
              className="h-10 w-10 shrink-0 rounded-full bg-flat object-cover"
            />
          ) : (
            <AvatarBadge name={video.snippet.channelTitle} size={40} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold text-ink">
              {video.snippet.channelTitle}
            </p>
            {v && <p className="text-[11px] text-ink-2">{formatCount(v)}位订阅者</p>}
          </div>
        </Link>
        <button
          type="button"
          onClick={toggleSubscribe}
          className={
            subscribed
              ? `h-9 shrink-0 rounded-full px-4 text-xs font-bold ${
                  confirming ? "bg-accent text-white" : "bg-flat text-ink-2"
                }`
              : "h-9 shrink-0 rounded-full bg-accent px-4 text-xs font-bold text-white"
          }
        >
          {subscribed ? (confirming ? "确认取消订阅？" : "已订阅") : "添加订阅"}
        </button>
      </div>

      {/* 操作气泡组：纯 icon 圆钮（2026-10-30 王总指定去文字防变形）——
          上一个/下一个（沿来源列表顺序，悬停 title 带视频标题）+ 待看 / 收藏（分组 sheet）/ 下载（清晰度 sheet） */}
      <div className="flex items-center gap-2.5 overflow-x-auto border-b border-line bg-surface px-3.5 py-2.5">
        {(nav.prev || nav.next) && (
          <>
            <button
              type="button"
              disabled={!nav.prev}
              onClick={() => nav.prev && navigate(`/watch/${nav.prev.id}`)}
              title={nav.prev ? `上一个：${nav.prev.title}` : undefined}
              aria-label="播放上一个视频"
              className="m-glass-btn m-glass-icon-btn disabled:opacity-40"
            >
              <Icon name="arrowLeft" size={17} />
            </button>
            <button
              type="button"
              disabled={!nav.next}
              onClick={() => nav.next && navigate(`/watch/${nav.next.id}`)}
              title={nav.next ? `下一个：${nav.next.title}` : undefined}
              aria-label="播放下一个视频"
              className="m-glass-btn m-glass-icon-btn disabled:opacity-40"
            >
              <Icon name="chevronRight" size={17} />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={toggleWatchLater}
          aria-label={inWl ? (confirming ? "再点一次确认移出待看" : "移出待看") : "加入待看"}
          title={inWl ? (confirming ? "再点一次确认移出" : "已在待看，点击移除") : "加入待看"}
          className={`m-glass-btn m-glass-icon-btn ${
            inWl ? (confirming ? "!text-red-500" : "!text-accent") : ""
          }`}
        >
          <Icon name="watchLater" size={17} />
        </button>
        <button
          type="button"
          onClick={() => setFavOpen(true)}
          aria-label={faved ? "管理收藏" : "收藏"}
          className={`m-glass-btn m-glass-icon-btn ${faved ? "!text-accent" : ""}`}
        >
          <Icon name={faved ? "star" : "starBorder"} size={17} />
        </button>
        <button
          type="button"
          disabled={!isTauri()}
          onClick={openDownloadSheet}
          aria-label={dlLoading ? "正在提取下载地址" : "下载视频"}
          className={`m-glass-btn m-glass-icon-btn ${!isTauri() ? "opacity-40" : ""} ${dlLoading ? "animate-pulse" : ""}`}
        >
          <Icon name="download" size={17} />
        </button>
      </div>

      </div>

      {/* 相关视频：wide 档右侧栏（双栏 list-detail，UI 稿 A3）；窄档保持底部流 */}
      <aside className="mt-2 wide:mt-0 wide:min-w-0 wide:flex-1">
        <h2 className="hidden wide:block wide:pb-2 wide:text-[13px] wide:font-extrabold wide:text-ink">
          相关视频
        </h2>
        {relatedStatus === "loading" ? (
          <RowSkeleton rows={4} />
        ) : relatedStatus === "error" ? (
          <p className="p-4 text-xs text-ink-3">相关视频加载失败</p>
        ) : (
          related.map((rv, i) => <RowCard key={videoIdOf(rv) ?? i} video={rv} />)
        )}
      </aside>

      {/* 收藏分组 sheet */}
      <FavGroupSheet
        open={favOpen}
        onClose={() => setFavOpen(false)}
        video={{ videoId, title: video.snippet.title }}
        faved={faved}
        onPick={(groupId) => {
          useFavorites.getState().add(
            {
              videoId,
              title: video.snippet.title,
              channelId,
              channelTitle: video.snippet.channelTitle,
              thumb: bestThumb(video.snippet),
            },
            groupId,
          );
          setFavOpen(false);
        }}
      />

      {/* 下载清晰度 sheet（ANDROID_VR 提取流；保存目录 M4 指到 appDataDir/offline） */}
      <BottomSheet open={dlOpen} onClose={() => setDlOpen(false)} title="选择下载清晰度">
        {dlLoading ? (
          <div className="flex flex-col gap-2 py-1">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-11 animate-pulse rounded-xl bg-flat" />
            ))}
          </div>
        ) : dlError ? (
          <p className="py-3 text-[12.5px] text-accent">{dlError}</p>
        ) : (
          <>
            <p className="mb-2 text-[11.5px] text-ink-3">
              {video.snippet.channelTitle} · {parseDuration(video.contentDetails?.duration)}
            </p>
            {dlOptions.map((o) => (
              <button
                key={o.videoItag}
                type="button"
                onClick={() => setDlPicked(o)}
                className={`mb-2 flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-bold ${
                  dlPicked?.videoItag === o.videoItag
                    ? "border-accent bg-accent/5"
                    : "border-line"
                }`}
              >
                {o.label}
                {o.needsMerge && (
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    合流
                  </span>
                )}
                <span className="ml-auto text-[11.5px] font-semibold text-ink-3">
                  ≈ {(o.sizeBytes / 1024 / 1024).toFixed(0)} MB
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={!dlPicked}
              onClick={() => {
                if (!dlPicked) return;
                enqueue(
                  {
                    videoId,
                    title: video.snippet.title,
                    channelTitle: video.snippet.channelTitle,
                    thumb: bestThumb(video.snippet),
                    duration: video.contentDetails?.duration
                      ? parseDuration(video.contentDetails.duration)
                      : "",
                  },
                  dlPicked,
                );
                setDlOpen(false);
              }}
              className={`mt-1 w-full rounded-full py-2.5 text-[14px] font-extrabold text-white ${
                dlPicked ? "bg-accent" : "bg-flat-strong text-ink-3"
              }`}
            >
              ⭳ 开始下载
            </button>
          </>
        )}
      </BottomSheet>
    </div>
  );
}
