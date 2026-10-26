import Img from "./Img";
import { Link } from "react-router-dom";
import type { VideoItem } from "../types/youtube";
import { bestThumb, formatCount, formatRelativeDate, formatViews, parseDuration } from "../lib/format";

export function videoIdOf(v: VideoItem): string {
  return typeof v.id === "string" ? v.id : (v.id.videoId ?? "");
}

/** 宽卡片：缩略图在左，信息在右（搜索 / 热门列表用） */
export function VideoRow({ video, rank }: { video: VideoItem; rank?: number }) {
  const id = videoIdOf(video);
  if (!id) return null;
  return (
    <div className="flex gap-4 rounded-lg p-2 hover:bg-flat">
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
    <div className="min-w-0">
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
