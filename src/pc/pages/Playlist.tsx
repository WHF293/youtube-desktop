import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { usePlaylist } from "../../common/stores/playlist";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import { VideoCard, VideoGridSkeleton } from "../components/VideoCard";
import { ErrorBox } from "../../common/components/Spinner";

/** 播放列表详情页（/playlist/:playlistId，博主页播放列表点入）：
 *  列表标题 + 视频网格，触底经 InnerTube continuation 翻页加载下一批 */
export default function Playlist() {
  const { playlistId = "" } = useParams();
  const { title, items, status, error, nextPageToken, loadingMore, load, loadMore } = usePlaylist();
  // 触底哨兵：进入视口即翻页（页面滚动容器在布局层，无需感知具体是哪个祖先在滚）
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (playlistId) void load(playlistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  // 注册视频导航队列：详情页「上一个/下一个」按播放列表顺序切换
  useVideoNavQueue(`pc-playlist-${playlistId}`, toNavEntries(items));

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && nextPageToken && !loadingMore) void loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [nextPageToken, loadingMore, loadMore]);

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      {status === "loading" ? (
        <VideoGridSkeleton rows={8} />
      ) : status === "error" ? (
        <ErrorBox message={error} onRetry={() => void load(playlistId)} />
      ) : (
        <>
          <div className="p-4 pb-2">
            <h1 className="truncate text-lg font-semibold text-ink">{title || "播放列表"}</h1>
            <p className="mt-0.5 text-xs text-ink-3">
              {items.length > 0 ? `${items.length} 个视频` : ""}
              {nextPageToken ? " · 上滑加载更多" : ""}
            </p>
          </div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-ink-2">没有获取到播放列表内容。</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-3 gap-y-5 p-4">
              {items.map((v) => (
                <VideoCard key={v.etag} video={v} />
              ))}
            </div>
          )}
          {/* 触底哨兵：翻页中显示行内 loading，到底后不再渲染提示 */}
          <div ref={sentinelRef} className="h-2" />
          {loadingMore && (
            <p className="pb-4 text-center text-xs text-ink-3">加载中…</p>
          )}
        </>
      )}
    </div>
  );
}
