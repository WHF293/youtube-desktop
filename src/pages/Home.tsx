import { useEffect, useRef } from "react";
import { useVideos } from "../stores/videos";
import { VideoGrid } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../components/Spinner";

/** 首页分类 tab（YouTube 官方 videoCategoryId，1 配额单位/次）；
 *  播客与 Shorts 无 API 等价物，不做（王总确认 2026-10-26） */
const CATEGORIES: ReadonlyArray<readonly [string, string]> = [
  ["10", "音乐"],
  ["20", "游戏"],
  ["17", "体育"],
  ["25", "新闻"],
  ["24", "娱乐"],
  ["28", "科技"],
  ["27", "教育"],
  ["19", "旅行与活动"],
];

/** 首页：分类 tab + mostPopular 推荐网格，滚动到底自动加载下一页 */
export default function Home() {
  const {
    items,
    status,
    error,
    loadPopular,
    nextPageToken,
    loadingMore,
    loadMorePopular,
    category,
  } = useVideos();
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (status === "idle") void loadPopular(category);
  }, [status, loadPopular, category]);

  // 切换分类
  const pickCategory = (catId?: string) => {
    if (catId === category) return;
    void loadPopular(catId);
  };

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
  if (status === "error") return <ErrorBox message={error} onRetry={() => void loadPopular(category)} />;

  return (
    <div>
      {/* 分类 tab（官网风格 pill，选中黑底/暗模式白底反色） */}
      <div className="sticky top-0 z-10 flex gap-2 overflow-x-auto bg-app px-4 py-3">
        <button
          type="button"
          onClick={() => pickCategory(undefined)}
          className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-colors ${
            category === undefined
              ? "bg-ink text-surface"
              : "bg-flat text-ink hover:bg-flat-strong"
          }`}
        >
          全部
        </button>
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => pickCategory(id)}
            className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm transition-colors ${
              category === id ? "bg-ink text-surface" : "bg-flat text-ink hover:bg-flat-strong"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <p className="p-6 text-sm text-ink-2">该分类下没有获取到视频。</p>
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
