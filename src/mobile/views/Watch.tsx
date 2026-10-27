import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePlayer } from "../../common/stores/player";
import { useChannels } from "../../common/stores/channels";
import { useWatchLater } from "../../common/stores/watchLater";
import { bestThumb, formatCount, formatRelativeDate, formatViews, parseDuration, videoIdOf } from "../../common/lib/format";
import Spinner, { ErrorBox } from "../../common/components/Spinner";
import Img from "../../common/components/Img";
import { AvatarBadge, RowCard } from "../components/VideoCards";
import Icon from "../../common/components/Icon";

/** 移动端观看页：沉浸式无 TabBar。iframe 播放 + 标题 + 频道行（订阅两步确认）+
 *  待看开关 + 相关视频。收藏/下载/评论 M3 接入（BottomSheet 已就位）。 */
export default function WatchView() {
  const { videoId = "" } = useParams();
  const navigate = useNavigate();
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

  useEffect(() => {
    void load(videoId);
    return () => {
      window.clearTimeout(confirmTimer.current);
    };
  }, [videoId, load]);

  if (status === "loading" || status === "idle") {
    return <Spinner label="加载视频…" />;
  }
  if (status === "error" || !video) {
    return (
      <ErrorBox
        message={error || "视频不存在或已被删除"}
        onRetry={() => void load(videoId)}
      />
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
  };

  return (
    <div className="bg-app">
      {/* 播放器：静态 iframe（IFrame API 在 WebView2 实测黑屏，桌面同款方案）；
          Android WebView 无 --proxy-server 注入，挂代理用户画面可能加载不出（见开发方案 §6） */}
      <div className="relative aspect-video bg-black">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&cc_load_policy=1&cc_lang_pref=zh-Hans&hl=zh-CN`}
          title={video.snippet.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate(-1)}
          className="absolute left-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white"
        >
          <Icon name="arrowLeft" size={18} />
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

      {/* 频道行：头像 + 订阅按钮（两步确认） */}
      <div className="flex items-center gap-2.5 border-b border-line bg-surface px-3.5 py-2.5">
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

      {/* 操作气泡组：待看（收藏/下载 M3 经 BottomSheet 接入） */}
      <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface px-3.5 py-2.5">
        <button
          type="button"
          onClick={toggleWatchLater}
          className={`m-glass-btn ${inWl ? "!text-accent" : ""}`}
        >
          {inWl ? (confirming ? "确认移出？" : "✓ 已在待看") : "◷ 待看"}
        </button>
        <span className="m-glass-btn text-ink-3">★ 收藏（M3）</span>
        <span className="m-glass-btn text-ink-3">⭳ 下载（M3）</span>
      </div>

      {/* 相关视频 */}
      <div className="mt-2">
        {relatedStatus === "loading" ? (
          <Spinner label="加载相关视频…" />
        ) : relatedStatus === "error" ? (
          <p className="p-4 text-xs text-ink-3">相关视频加载失败</p>
        ) : (
          related.map((rv, i) => <RowCard key={videoIdOf(rv) ?? i} video={rv} />)
        )}
      </div>
    </div>
  );
}
