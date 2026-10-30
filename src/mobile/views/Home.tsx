import { useEffect } from "react";
import { useVideos } from "../../common/stores/videos";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import RefreshFab from "../../common/components/RefreshFab";
import { FeedCard, FeedSkeleton } from "../components/VideoCards";import { EmptyState, ErrorState } from "../components/StateViews";
import { videoIdOf } from "../../common/lib/format";

/** 移动端推荐页：地区频道组推荐流（内容跟随推荐地区 popularRegionCode，navbar 内选择），
 *  与分类页（/categories）拆分独立 */
export default function HomeView() {
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

  useEffect(() => {
    // 从分类页/搜索页返回等场景：store 残留分类或搜索结果，回推荐页必须复位为推荐流
    if (status === "idle" || useVideos.getState().mode !== "popular" || category !== undefined) {
      void loadPopular(undefined);
    }
  }, [status, loadPopular, category]);

  // 注册视频导航队列：详情页「上一个/下一个」按本列表顺序切换
  useVideoNavQueue("m-home", toNavEntries(items));

  // 触底加载（提前 600px 预取）：桌面端 IntersectionObserver 在 WebView2 实测不触发，
  // 沿用 scroll 事件方案；移动端同系 Chromium 内核，同一实现（Android 上待真机复验）
  useEffect(() => {
    if (status !== "ready") return;
    const scroller = document.getElementById("m-scroll");
    if (!scroller) return;
    const check = () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 600) {
        void loadMorePopular();
      }
    };
    check();
    scroller.addEventListener("scroll", check, { passive: true });
    return () => scroller.removeEventListener("scroll", check);
  }, [status, nextPageToken, loadingMore, loadMorePopular]);

  return (
    <div className="m-page relative">
      {status === "loading" || status === "idle" ? (
        /* 加载期沿用骨架屏（骨架即 loading，不再闪一帧 Spinner） */
        <FeedSkeleton />
      ) : status === "error" ? (
        <ErrorState desc={error} onRetry={() => void loadPopular(undefined, true)} />
      ) : (
        <>
          {/* 小米断点（UI 稿 A0/A1/A2）：<600 单列全宽；600–840 两列；≥840 三列 */}
          <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-2.5 tablet:p-2.5 wide:grid-cols-3">
            {items.map((v, i) => (
              <FeedCard key={videoIdOf(v) ?? i} video={v} />
            ))}
          </div>
          {items.length === 0 && (
            <EmptyState illust="⌕" title="没有获取到推荐视频" desc="点右上角刷新试试" />
          )}
          {loadingMore && <FeedSkeleton rows={2} />}
          {!nextPageToken && items.length > 0 && (
            <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
          )}
        </>
      )}
      {/* 刷新固钉（回顶固钉上方 10px，取代下拉刷新手势）：force 清缓存重拉 */}
      <RefreshFab className="m-fab-top m-fab-refresh" onRefresh={() => loadPopular(undefined, true)} />
      <ScrollTopFab targetId="m-scroll" className="m-fab-top" />
    </div>
  );
}
