import { useEffect } from "react";
import { useVideos } from "../../common/stores/videos";
import Spinner from "../../common/components/Spinner";
import { FeedCard } from "../components/VideoCards";
import { EmptyState, ErrorState } from "../components/StateViews";
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
    <div className="m-page">
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

      {status === "loading" || status === "idle" ? (
        <Spinner label="加载推荐视频…" />
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
          {loadingMore && <Spinner label="加载更多…" />}
          {!nextPageToken && items.length > 0 && (
            <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
          )}
        </>
      )}
    </div>
  );
}
