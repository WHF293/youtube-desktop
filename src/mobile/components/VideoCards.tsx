import { Link } from "react-router-dom";
import Img from "../../common/components/Img";
import type { VideoItem } from "../../common/types/youtube";
import {
  bestThumb,
  formatRelativeDate,
  formatViews,
  parseDuration,
} from "../../common/lib/format";
import { videoIdOf } from "../../common/lib/format";

/** 频道头像兜底：首字色块（无网络依赖；订阅博主有 thumb 时上层直接用 Img） */
export function AvatarBadge({ name, size = 34 }: { name: string; size?: number }) {
  const hues = [0, 210, 130, 265, 25, 170, 330];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `hsl(${hues[h % hues.length]} 55% 45%)`,
      }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** 首页单列大卡：16:9 缩略图 + 时长角标 + 频道头像 + 两行标题（UI 稿 A0 feed-card） */
export function FeedCard({ video }: { video: VideoItem }) {
  const id = videoIdOf(video);
  if (!id) return null;
  const title = video.snippet.title;
  return (
    <div className="bg-surface">
      <Link to={`/watch/${id}`} className="relative block bg-flat">
        <ImgThumb src={bestThumb(video.snippet)} title={title} />        {video.contentDetails?.duration && (
          <span className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-bold text-white">
            {parseDuration(video.contentDetails.duration)}
          </span>
        )}
      </Link>
      <div className="flex gap-2.5 px-3.5 pb-2.5 pt-2.5">
        <Link to={`/channel/${video.snippet.channelId}`} aria-label={`进入 ${video.snippet.channelTitle} 主页`} className="shrink-0">
          <AvatarBadge name={video.snippet.channelTitle} />
        </Link>
        <Link to={`/watch/${id}`} className="min-w-0 flex-1">
          <p className="clamp-2 text-[14px] font-bold leading-[1.4] text-ink">{title}</p>
          <p className="mt-1 text-[11.5px] text-ink-2">
            {video.snippet.channelTitle}
            {video.statistics?.viewCount && ` · ${formatViews(video.statistics.viewCount)}次观看`}
            {` · ${formatRelativeDate(video.snippet.publishedAt)}`}
          </p>
        </Link>
      </div>
    </div>
  );
}

/** 紧凑行卡：左缩略图右信息（订阅流 / 搜索结果 / 相关视频，UI 稿 row-card） */
export function RowCard({ video }: { video: VideoItem }) {
  const id = videoIdOf(video);
  if (!id) return null;
  return (
    <Link
      to={`/watch/${id}`}
      className="flex gap-2.5 border-b border-line bg-surface px-3.5 py-2.5 active:bg-flat"
    >
      <div className="relative aspect-video w-[142px] shrink-0 overflow-hidden rounded-xl bg-flat">
        <ImgThumb src={bestThumb(video.snippet)} title={video.snippet.title} />
        {video.contentDetails?.duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-bold text-white">
            {parseDuration(video.contentDetails.duration)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="clamp-2 text-[13px] font-bold leading-[1.4] text-ink">
          {video.snippet.title}
        </p>
        <p className="mt-1 truncate text-[11px] text-ink-2">{video.snippet.channelTitle}</p>
        <p className="text-[10.5px] text-ink-3">
          {[
            video.statistics?.viewCount ? `${formatViews(video.statistics.viewCount)}次观看` : "",
            formatRelativeDate(video.snippet.publishedAt),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </Link>
  );
}

/** 缩略图（经 yt_image 代理，Img 组件在 common） */
function ImgThumb({ src, title }: { src: string; title: string }) {
  return <Img src={src} alt={title} loading="lazy" className="aspect-video w-full object-cover" />;
}

/** 骨架屏：左右滑切换分类/分组过渡期占位（动画结束才发真实请求，见 Home/Subscriptions）。
 *  形态分别对齐 FeedCard（封面+标题两行）与 RowCard（左封面右两行），pulse 呼吸 */
export function FeedSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-2.5 tablet:p-2.5 wide:grid-cols-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="bg-surface">
          <div className="aspect-video w-full animate-pulse bg-flat" />
          <div className="flex gap-2.5 px-3.5 pb-2.5 pt-2.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-flat" />
            <div className="min-w-0 flex-1">
              <div className="h-3 w-full animate-pulse rounded bg-flat" />
              <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-flat" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RowSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-2.5 border-b border-line bg-surface px-3.5 py-2.5">
          <div className="aspect-video w-[142px] shrink-0 animate-pulse rounded-xl bg-flat" />
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="h-3 w-full animate-pulse rounded bg-flat" />
            <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-flat" />
          </div>
        </div>
      ))}
    </div>
  );
}
