import { useEffect } from "react";
import { useVideos } from "../stores/videos";
import { registerPageRefresh } from "../lib/refresh";
import GlassChipGroup from "../components/GlassChipGroup";
import { VideoGrid } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../components/Spinner";

/** 首页分类 tab（YouTube 官方 videoCategoryId）；「新闻」分类内容跟随地区（InnerTube 搜索地区化） */
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

  useEffect(() => {
    // 从搜索页返回等场景：store 残留的是搜索结果（mode=search），回到首页必须复位为推荐流，
    // 否则列表错乱且触底加载在 mode 不匹配下失效
    if (status === "idle" || useVideos.getState().mode !== "popular") void loadPopular(category);
  }, [status, loadPopular, category]);

  // 右下角刷新固钉：保留当前分类刷新
  useEffect(
    () =>
      registerPageRefresh("/", () => {
        const { category: cat } = useVideos.getState();
        void useVideos.getState().loadPopular(cat);
      }),
    [],
  );

  // 切换分类
  const pickCategory = (catId?: string) => {
    if (catId === category) return;
    void loadPopular(catId);
  };

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

  if (status === "loading" || status === "idle") return <Spinner label="加载推荐视频…" />;
  if (status === "error") return <ErrorBox message={error} onRetry={() => void loadPopular(category)} />;

  return (
    <div>
      {/* 分类 tab（whf-stock-board 高光玻璃按钮组：滑动玻璃气泡选中态） */}
      <div className="sticky top-0 z-10 bg-app px-4 py-3">
        <GlassChipGroup
          options={TAB_OPTIONS}
          value={category ?? ""}
          onChange={(v) => pickCategory(v || undefined)}
          wrap={false}
          className="max-w-full overflow-x-auto"
        />
      </div>

      {items.length === 0 ? (
        <p className="p-6 text-sm text-ink-2">该分类下没有获取到视频。</p>
      ) : (
        <VideoGrid videos={items} />
      )}
      {loadingMore && <Spinner label="加载更多…" />}
      {!nextPageToken && items.length > 0 && (
        <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
      )}
    </div>
  );
}
