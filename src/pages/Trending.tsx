import { useEffect, useRef } from "react";
import { useVideos } from "../stores/videos";
import { VideoRow } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../components/Spinner";

/** 热门：mostPopular 排行列表（带名次），滚动到底自动加载下一页 */
export default function Trending() {
  const { items, status, error, loadPopular, nextPageToken, loadingMore, loadMorePopular } =
    useVideos();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status === "idle") void loadPopular();
  }, [status, loadPopular]);

  // IntersectionObserver 触底加载（提前 600px 预取）
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || status !== "ready") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMorePopular();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, nextPageToken, loadingMore, loadMorePopular]);

  if (status === "loading" || status === "idle") return <Spinner label="加载热门视频…" />;
  if (status === "error") return <ErrorBox message={error} onRetry={() => void loadPopular()} />;

  return (
    <div>
      <h1 className="px-4 pt-4 text-lg font-semibold text-ink">热门视频</h1>
      <div className="p-2">
        {items.map((v, i) => (
          <VideoRow key={v.etag} video={v} rank={i + 1} />
        ))}
      </div>
      <div ref={sentinelRef} aria-hidden="true" />
      {loadingMore && <Spinner label="加载更多…" />}
      {!nextPageToken && items.length > 0 && (
        <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
      )}
    </div>
  );
}
