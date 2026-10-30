import { useEffect } from "react";
import { useVideos } from "../../common/stores/videos";
import { registerPageRefresh } from "../../common/lib/refresh";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import { VideoGrid } from "../components/VideoCard";
import { ErrorBox } from "../../common/components/Spinner";
import { VideoGridSkeleton } from "../components/VideoCard";
import RegionPicker from "../components/RegionPicker";

/** 推荐页：地区频道组推荐流（内容跟随推荐地区 popularRegionCode，页头内选择即生效），
 *  与分类页（/categories）拆分独立 */
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

  useEffect(() => {
    // 从分类页返回等场景：store 残留的是分类结果（category 非空），回推荐页必须复位为推荐流；
    // mode 为 search 同理（搜索页残留）
    if (status === "idle" || useVideos.getState().mode !== "popular" || category !== undefined) {
      void loadPopular(undefined);
    }
  }, [status, loadPopular, category]);

  // 注册视频导航队列：详情页「上一个/下一个」按本列表顺序切换
  useVideoNavQueue("pc-home", toNavEntries(items));

  // 右下角刷新固钉：force 清推荐缓存重拉
  useEffect(
    () =>
      registerPageRefresh("/home", () => {
        void useVideos.getState().loadPopular(undefined, true);
      }),
    [],
  );

  // 触底加载（提前 600px 预取）：直接监听主滚动容器 scroll 事件——
  // IntersectionObserver 方案在 WebView2 下实测不触发（历史三次失效均为同症状），弃用
  useEffect(() => {
    if (status !== "ready") return;
    const scroller = document.getElementById("main-scroll");
    if (!scroller) return;
    const check = () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 600) {
        void loadMorePopular();
      }
    };
    check(); // 挂载/翻页后立即查一次：首屏未填满或已停在底部时也能续载
    scroller.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      scroller.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [status, nextPageToken, loadingMore, loadMorePopular]);

  return (
    <div>
      {/* 页头：标题 + 推荐地区（sticky，与分类页页头同构） */}
      <div className="sticky top-0 z-10 flex items-center bg-app px-4 py-3">
        <h1 className="text-base font-semibold text-ink">推荐</h1>
        <RegionPicker scope="popular" />
      </div>

      {status === "loading" || status === "idle" ? (
        <VideoGridSkeleton rows={12} />
      ) : status === "error" ? (
        <ErrorBox message={error} onRetry={() => void loadPopular(undefined, true)} />
      ) : (
        <>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-ink-2">没有获取到推荐视频。</p>
          ) : (
            <VideoGrid videos={items} />
          )}
          {loadingMore && <VideoGridSkeleton rows={2} />}
          {!nextPageToken && items.length > 0 && (
            <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
          )}
        </>
      )}
      {/* 回到顶部固钉（平滑滚动） */}
      <ScrollTopFab
        targetId="main-scroll"
        className="glass-btn fixed bottom-6 right-6 z-40 flex h-10 w-10 items-center justify-center rounded-full text-ink-2"
      />
    </div>
  );
}
