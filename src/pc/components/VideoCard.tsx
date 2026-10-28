import Img from "../../common/components/Img";
import { Link } from "react-router-dom";
import type { VideoItem } from "../../common/types/youtube";
import {
  bestThumb,
  formatCount,
  formatRelativeDate,
  formatViews,
  parseDuration,
  videoIdOf,
} from "../../common/lib/format";

export { videoIdOf };

/** 宽卡片：缩略图在左，信息在右（搜索 / 热门列表用） */
export function VideoRow({ video, rank }: { video: VideoItem; rank?: number }) {
  const id = videoIdOf(video);
  if (!id) return null;
  return (
    <div className="flex gap-4 rounded-lg p-2 transition-transform duration-200 hover:scale-[1.05] hover:bg-flat">
      {rank !== undefined && (
        <span className="w-6 shrink-0 self-center text-center text-lg font-semibold text-ink-3">
          {rank}
        </span>
      )}
      <Link to={`/watch/${id}`} className="relative shrink-0">
        <Img
          src={bestThumb(video.snippet)}
          alt=""
          loading="lazy"
          className="aspect-video w-40 rounded-lg bg-flat object-cover sm:w-60"
        />
        {video.contentDetails?.duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium text-white">
            {parseDuration(video.contentDetails.duration)}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/watch/${id}`} className="clamp-2 text-base font-medium leading-6 text-ink hover:text-ink-2">
          {video.snippet.title}
        </Link>
        <p className="mt-1 text-xs text-ink-2">
          {video.snippet.channelTitle}
          {video.statistics?.viewCount && ` · ${formatViews(video.statistics.viewCount)}`}
          {` · ${formatRelativeDate(video.snippet.publishedAt)}`}
        </p>
        <p className="clamp-2 mt-1 hidden text-xs leading-5 text-ink-3 sm:block">
          {video.snippet.description}
        </p>
      </div>
    </div>
  );
}

/** 网格卡片（首页 / 频道页用） */
export function VideoCard({ video }: { video: VideoItem }) {
  const id = videoIdOf(video);
  if (!id) return null;
  return (
    <div className="min-w-0 transition-transform duration-200 hover:scale-[1.05]">
      <Link to={`/watch/${id}`} className="relative block">
        <Img
          src={bestThumb(video.snippet)}
          alt=""
          loading="lazy"
          className="aspect-video w-full rounded-lg bg-flat object-cover"
        />
        {video.contentDetails?.duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-xs font-medium text-white">
            {parseDuration(video.contentDetails.duration)}
          </span>
        )}
      </Link>
      <div className="mt-2 flex gap-3">
        <div className="min-w-0 flex-1">
          <Link to={`/watch/${id}`} className="clamp-2 text-sm font-medium leading-5 text-ink">
            {video.snippet.title}
          </Link>
          <p className="mt-1 truncate text-xs text-ink-2">{video.snippet.channelTitle}</p>
          <p className="text-xs text-ink-3">
            {[
              video.statistics?.viewCount ? formatViews(video.statistics.viewCount) : "",
              formatRelativeDate(video.snippet.publishedAt),
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </div>
    </div>
  );
}

/** 响应式网格 */
export function VideoGrid({ videos }: { videos: VideoItem[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-3 gap-y-5 p-3">
      {videos.map((v) => (
        <VideoCard key={videoIdOf(v) ?? v.etag} video={v} />
      ))}
    </div>
  );
}

/** 观看数 / 点赞数小徽标（详情页用） */
export function StatItem({ icon, value }: { icon: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-2">
      {value}
      {icon && <span className="inline-flex">{icon}</span>}
    </span>
  );
}

export function formatCountOrEmpty(n?: string) {
  return formatCount(n);
}

/** 骨架屏：网格卡占位（pulse 呼吸），形态对齐 VideoCard/VideoGrid */
export function VideoGridSkeleton({ rows = 12 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-x-3 gap-y-5 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <div className="aspect-video w-full animate-pulse rounded-lg bg-flat" />
          <div className="mt-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-flat" />
            <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-flat" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 骨架屏：宽行卡占位，形态对齐 VideoRow */
export function VideoRowSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-1 p-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 rounded-lg p-2">
          <div className="aspect-video w-40 shrink-0 animate-pulse rounded-lg bg-flat sm:w-60" />
          <div className="min-w-0 flex-1 pt-1">
            <div className="h-4 w-3/4 animate-pulse rounded bg-flat" />
            <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-flat" />
            <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-flat" />
          </div>
        </div>
      ))}
    </div>
  );
}
