import { useEffect, useState } from "react";
import { useVideos } from "../../common/stores/videos";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import RefreshFab from "../../common/components/RefreshFab";
import { FeedCard, FeedSkeleton } from "../components/VideoCards";import { EmptyState, ErrorState } from "../components/StateViews";
import useSwipeSwitch from "../hooks/useSwipeSwitch";
import { videoIdOf } from "../../common/lib/format";

/** 移动端分类页分类（YouTube 官方 videoCategoryId，与桌面同源常量） */
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

// 上次浏览的分类（模块级记忆）：store 的 category 会被推荐页复位为 undefined，
// 分类页↔推荐页往返时靠它恢复选中项（会话内记忆，不持久化）
let lastSelected = "";

/** 移动端分类页：分类 chips + 单列视频流（推荐流在 /home），触底自动加载下一页 */
export default function CategoriesView() {
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

  // 选中分类（本地 state）：初始取 store 残留值，无残留则取模块记忆，再退默认「音乐」
  const [selected, setSelected] = useState<string>(() => {
    if (category && CATEGORIES.some(([id]) => id === category)) return category;
    if (lastSelected && CATEGORIES.some(([id]) => id === lastSelected)) return lastSelected;
    return CATEGORIES[0][0];
  });

  useEffect(() => {
    lastSelected = selected;
    // 挂载/切换分类时校准数据流：store 残留的推荐流（category=undefined）或搜索结果都要复位
    if (status === "idle" || useVideos.getState().mode !== "popular" || category !== selected) {
      void loadPopular(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selected 变化即重拉，其余依赖经 getState 取最新
  }, [selected]);

  // 注册视频导航队列：详情页「上一个/下一个」按当前分类列表顺序切换
  useVideoNavQueue("m-categories", toNavEntries(items));

  const pickCategory = (catId: string) => {
    setSelected(catId);
  };

  // 列表区左右滑切换分类（手势只绑 chips 下方内容区，不与 chips 条横向滚动冲突；
  // 垂直滑动占优时不触发）。swiper 式：拖拽跟手 + 两侧骨架屏随动，松手过阈值滑入
  const swipeIndex = Math.max(0, CATEGORIES.findIndex(([id]) => id === selected));
  const { ref: swipeRef, phase: swipePhase, containerStyle } = useSwipeSwitch<HTMLDivElement>({
    count: CATEGORIES.length,
    index: swipeIndex,
    onChange: (next) => pickCategory(CATEGORIES[next][0]),
  });

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

  // 分类 chips 常驻不随加载态卸载（桌面 v0.4.1 行为对齐）；
  // 移动端用分体胶囊按钮（每颗独立，选中态高光玻璃），不用桌面连体 GlassChipGroup
  return (
    <div className="m-page relative">
      <div className="m-chips sticky top-0 z-10">
        {CATEGORIES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`m-chip${selected === id ? " active" : ""}`}
            onClick={() => pickCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* swiper 式切换容器：pan-y 让纵向滚动走原生；overflow-x-clip 裁掉两侧
          骨架屏（不产生滚动容器，不影响触底加载），拖拽/过渡期间才挂载两侧面板 */}
      <div ref={swipeRef} className="relative overflow-x-clip" style={{ touchAction: "pan-y" }}>
        <div style={containerStyle}>
          {swipePhase !== null && swipeIndex > 0 && (
            <div className="absolute inset-y-0 right-full w-full">
              <FeedSkeleton />
            </div>
          )}
          {swipePhase !== null && swipeIndex < CATEGORIES.length - 1 && (
            <div className="absolute inset-y-0 left-full w-full">
              <FeedSkeleton />
            </div>
          )}
          {status === "loading" || status === "idle" ? (
            /* 加载期沿用骨架屏（骨架即 loading，不再闪一帧 Spinner） */
            <FeedSkeleton />
          ) : status === "error" ? (
            <ErrorState desc={error} onRetry={() => void loadPopular(selected, true)} />
          ) : (
            <>
              {/* 小米断点（UI 稿 A0/A1/A2）：<600 单列全宽；600–840 两列；≥840 三列 */}
              <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-2.5 tablet:p-2.5 wide:grid-cols-3">
                {items.map((v, i) => (
                  <FeedCard key={videoIdOf(v) ?? i} video={v} />
                ))}
              </div>
              {items.length === 0 && (
                <EmptyState illust="⌕" title="该分类下没有视频" desc="换个分类逛逛吧" />
              )}
              {loadingMore && <FeedSkeleton rows={2} />}
              {!nextPageToken && items.length > 0 && (
                <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
              )}
            </>
          )}
        </div>
      </div>
      {/* 刷新固钉（回顶固钉上方 10px，取代下拉刷新手势）：force 清分类缓存重拉 */}
      <RefreshFab className="m-fab-top m-fab-refresh" onRefresh={() => loadPopular(selected, true)} />
      <ScrollTopFab targetId="m-scroll" className="m-fab-top" />
    </div>
  );
}
