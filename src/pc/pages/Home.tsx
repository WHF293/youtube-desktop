import { useEffect } from "react";
import { useVideos } from "../../common/stores/videos";
import { registerPageRefresh } from "../../common/lib/refresh";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import GlassChipGroup from "../../common/components/GlassChipGroup";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import { VideoGrid } from "../components/VideoCard";
import { ErrorBox } from "../../common/components/Spinner";
import { VideoGridSkeleton } from "../components/VideoCard";

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
  { value: "", label: "推荐" },
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

  // 注册视频导航队列：详情页「上一个/下一个」按本列表顺序切换
  useVideoNavQueue("pc-home", toNavEntries(items));

  // 右下角刷新固钉：保留当前分类刷新（首页路径 /home，根路径已重定向到订阅页）
  useEffect(
    () =>
      registerPageRefresh("/home", () => {
        const { category: cat } = useVideos.getState();
        // 刷新固钉 = force：清分类缓存重拉（普通切换走缓存直接渲染）
        void useVideos.getState().loadPopular(cat, true);
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

  // tab 栏常驻不随加载状态卸载（避免切换分类时按钮组闪烁），只有下方内容区切换加载态
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

      {status === "loading" || status === "idle" ? (
        <VideoGridSkeleton rows={12} />
      ) : status === "error" ? (
        <ErrorBox message={error} onRetry={() => void loadPopular(category, true)} />
      ) : (
        <>
          {items.length === 0 ? (
            <p className="p-6 text-sm text-ink-2">该分类下没有获取到视频。</p>
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
