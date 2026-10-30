import { useEffect, useState } from "react";
import { useVideos } from "../../common/stores/videos";
import { registerPageRefresh } from "../../common/lib/refresh";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import { VideoGrid } from "../components/VideoCard";
import { ErrorBox } from "../../common/components/Spinner";
import { VideoGridSkeleton } from "../components/VideoCard";
import RegionPicker from "../components/RegionPicker";

/** 分类页分类 tab（YouTube 官方 videoCategoryId）；「新闻」分类内容跟随分类地区（搜索地区化） */
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

/** 分类页：分类 tab + 分类内容网格（推荐流在 /home），滚动到底自动加载下一页 */

const CATEGORY_OPTIONS = CATEGORIES.map(([id, label]) => ({ value: id, label }));

// 上次浏览的分类（模块级记忆）：store 的 category 会被推荐页复位为 undefined，
// 分类页↔推荐页往返时靠它恢复选中项（会话内记忆，不持久化）
let lastSelected = "";

export default function Categories() {
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

  // 选中分类（本地 state）：初始取 store 残留值（上次浏览的分类），无残留则取模块记忆，再退默认「音乐」
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

  // 注册视频导航队列：详情页「上一个/下一个」按本列表顺序切换
  useVideoNavQueue("pc-categories", toNavEntries(items));

  // 右下角刷新固钉：force 清当前分类缓存重拉
  useEffect(
    () =>
      registerPageRefresh("/categories", () => {
        const { category: cat } = useVideos.getState();
        void useVideos.getState().loadPopular(cat ?? CATEGORIES[0][0], true);
      }),
    [],
  );

  // 切换分类
  const pickCategory = (catId: string) => {
    if (catId === selected) return;
    setSelected(catId);
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
      {/* 页头：分类独立胶囊按钮（一颗一颗，主题色选中切分）+ 分类地区（sticky） */}
      <div className="sticky top-0 z-10 bg-app px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
            {CATEGORY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => pickCategory(o.value)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                  selected === o.value
                    ? "bg-accent font-medium text-white"
                    : "bg-flat text-ink-2 hover:text-ink"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <RegionPicker scope="category" />
        </div>
      </div>

      {status === "loading" || status === "idle" ? (
        <VideoGridSkeleton rows={12} />
      ) : status === "error" ? (
        <ErrorBox message={error} onRetry={() => void loadPopular(selected, true)} />
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
