import { useEffect, useRef } from "react";
import { useVideos } from "../stores/videos";
import { VideoGrid } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../components/Spinner";

/** 首页：mostPopular 推荐网格，滚动到底自动加载下一页 */
export default function Home() {
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

  if (status === "loading" || status === "idle") return <Spinner label="加载推荐视频…" />;
  if (status === "error") return <ErrorBox message={error} onRetry={() => void loadPopular()} />;

  return (
    <div>
      <h1 className="px-4 pt-4 text-lg font-semibold text-ink">推荐视频</h1>
      {items.length === 0 ? (
        <p className="p-6 text-sm text-ink-2">没有获取到视频。</p>
      ) : (
        <VideoGrid videos={items} />
      )}
      <div ref={sentinelRef} aria-hidden="true" />
      {loadingMore && <Spinner label="加载更多…" />}
      {!nextPageToken && items.length > 0 && (
        <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
      )}
    </div>
  );
}
