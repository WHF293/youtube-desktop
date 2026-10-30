import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { usePlaylist } from "../../common/stores/playlist";
import { RowCard, RowSkeleton } from "../components/VideoCards";
import { EmptyState, ErrorState } from "../components/StateViews";
import { videoIdOf } from "../../common/lib/format";

/** 移动端播放列表详情页（/playlist/:playlistId，博主页播放列表点入）：
 *  顶栏由 MobileApp 统一渲染（文案「博主名-列表名」+ 返回）；视频行卡列表，
 *  触底经 InnerTube continuation 翻页 */
export default function PlaylistView() {
  const { playlistId = "" } = useParams();
  const { items, status, error, nextPageToken, loadingMore, load, loadMore } = usePlaylist();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (playlistId) void load(playlistId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]);

  // 触底翻页：#m-scroll 是页面滚动容器，sentinel 用 IntersectionObserver 无需拿到容器
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
    <div className="m-page">
      {status === "loading" || status === "idle" ? (
        <RowSkeleton rows={6} />
      ) : status === "error" ? (
        <ErrorState desc={error} onRetry={() => void load(playlistId)} />
      ) : items.length === 0 ? (
        <EmptyState illust="≡" title="没有内容" desc="该播放列表没有可展示的视频" />
      ) : (
        <>
          <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
            {items.map((v, i) => (
              <RowCard key={videoIdOf(v) ?? i} video={v} />
            ))}
          </div>
          {/* 触底哨兵 + 翻页态提示；nextPageToken 为空 = 到底，不再渲染 */}
          <div ref={sentinelRef} className="h-2" />
          {loadingMore && <p className="py-3 text-center text-[11.5px] text-ink-3">加载中…</p>}
        </>
      )}
    </div>
  );
}
