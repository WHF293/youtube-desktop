import { useEffect, useRef, useState } from "react";
import { useVideos } from "../../common/stores/videos";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import { FeedCard, FeedSkeleton } from "../components/VideoCards";import { EmptyState, ErrorState } from "../components/StateViews";
import useSwipeSwitch from "../hooks/useSwipeSwitch";
import { videoIdOf } from "../../common/lib/format";

/** 首页分类（YouTube 官方 videoCategoryId，与桌面同源常量） */
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

const TAB_OPTIONS = [
  { value: "", label: "全部" },
  ...CATEGORIES.map(([id, label]) => ({ value: id, label })),
] as const;

/** 移动端首页：分类 chips + 单列视频流，触底自动加载下一页 */
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
    if (status === "idle" || useVideos.getState().mode !== "popular") void loadPopular(category);
  }, [status, loadPopular, category]);

  const pickCategory = (catId?: string) => {
    if (catId === category) return;
    void loadPopular(catId);
  };

  // 列表区左右滑切换分类（与 TAB_OPTIONS 同序；首尾边界不循环，见 useSwipeSwitch；
  // 手势只绑 chips 下方内容区，不与 chips 条横向滚动冲突；垂直滑动占优时不触发，
  // 与触顶下拉刷新共存）。swiper 式：拖拽跟手 + 两侧骨架屏随动，松手过阈值滑入
  // 相邻骨架屏、动画结束才发真实请求，不够回弹
  const swipeIndex = Math.max(0, TAB_OPTIONS.findIndex((o) => (category ?? "") === o.value));
  const { ref: swipeRef, phase: swipePhase, containerStyle } = useSwipeSwitch<HTMLDivElement>({
    count: TAB_OPTIONS.length,
    index: swipeIndex,
    onChange: (next) => pickCategory(TAB_OPTIONS[next].value || undefined),
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

  // 触顶下拉刷新参数：超过阈值松手即刷新；带阻尼的上限，避免拉出屏幕外
  const PULL_TRIGGER_PX = 70;
  const PULL_MAX_PX = 110;
  const PULL_DAMP = 0.45;

  // 触顶下拉刷新：列表已在（ready），只有用户在顶部继续下拉才整页重拉——
  // 切 Tab 回来直接复用 store 里的列表与滚动位置，不自动重载
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchY = useRef<number | null>(null);
  const atTop = useRef(false);
  useEffect(() => {
    const scroller = document.getElementById("m-scroll");
    if (!scroller) return;
    const onStart = (e: TouchEvent) => {
      touchY.current = e.touches[0]?.clientY ?? null;
      atTop.current = scroller.scrollTop <= 0;
    };
    const onMove = (e: TouchEvent) => {
      if (touchY.current === null || !atTop.current || refreshing) return;
      const dy = (e.touches[0]?.clientY ?? 0) - touchY.current;
      setPull(dy > 0 ? Math.min(dy * PULL_DAMP, PULL_MAX_PX) : 0);
    };
    const onEnd = () => {
      touchY.current = null;
      setPull((p) => {
        if (p >= PULL_TRIGGER_PX && !refreshing) {
          setRefreshing(true);
          void loadPopular(category).finally(() => {
            setRefreshing(false);
            setPull(0);
          });
          return PULL_TRIGGER_PX;
        }
        return 0;
      });
    };
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: true });
    scroller.addEventListener("touchend", onEnd);
    scroller.addEventListener("touchcancel", onEnd);
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onEnd);
    };
  }, [refreshing, loadPopular, category]);

  const refreshHint = refreshing ? "刷新中…" : pull >= PULL_TRIGGER_PX ? "松手刷新" : "下拉刷新";

  // 分类 chips 常驻不随加载态卸载（桌面 v0.4.1 行为对齐）；
  // 移动端用分体胶囊按钮（每颗独立，选中态高光玻璃），不用桌面连体 GlassChipGroup
  return (
    <div className="m-page relative">
      {/* 触顶下拉刷新指示条：随 pull 距离展开（transform 不参与布局，列表整体下移） */}
      {(pull > 0 || refreshing) && (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-end justify-center overflow-hidden bg-transparent text-[11.5px] text-ink-2"
          style={{ height: refreshing ? 44 : pull, transition: refreshing ? "height .18s" : undefined }}
        >
          <span className="pb-2">{refreshHint}</span>
        </div>
      )}
      <div
        style={
          pull > 0 || refreshing
            ? { transform: `translateY(${refreshing ? 44 : pull}px)`, transition: refreshing ? "transform .18s" : undefined }
            : undefined
        }
      >
      <div className="m-chips sticky top-0 z-10">
        {TAB_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`m-chip${(category ?? "") === o.value ? " active" : ""}`}
            onClick={() => pickCategory(o.value || undefined)}
          >
            {o.label}
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
          {swipePhase !== null && swipeIndex < TAB_OPTIONS.length - 1 && (
            <div className="absolute inset-y-0 left-full w-full">
              <FeedSkeleton />
            </div>
          )}
          {status === "loading" || status === "idle" ? (
            /* 加载期沿用骨架屏（骨架即 loading，不再闪一帧 Spinner） */
            <FeedSkeleton />
          ) : status === "error" ? (
            <ErrorState desc={error} onRetry={() => void loadPopular(category)} />
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
      </div>
      {/* 回到顶部固钉（TabBar 上方 20px，平滑滚动） */}
      <ScrollTopFab targetId="m-scroll" className="m-fab-top" />
    </div>
  );
}