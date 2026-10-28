import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { EmptyState, ErrorState } from "../components/StateViews";
import useSwipeSwitch from "../hooks/useSwipeSwitch";
import { useSubsFeed } from "../../common/stores/subsFeed";
import { useChannels } from "../../common/stores/channels";
import Img from "../../common/components/Img";
import { AvatarBadge, RowCard, RowSkeleton } from "../components/VideoCards";
import { videoIdOf } from "../../common/lib/format";

/** 上次选中的分组 chip（模块级）：切到别的页再回来时恢复选中且不触发重拉 */
let lastChip = "all";

/** 移动端订阅页：博主横滑岛 + 分组 chips（sticky 固定，不随列表滚动）
 *  + 订阅更新流（分组筛选复用桌面 selectedGroups 逻辑；列表左右滑切换分组） */
export default function SubscriptionsView() {
  const navigate = useNavigate();
  const { items, failed, status, error, selectedGroups, setSelectedGroups, load } = useSubsFeed();
  const channels = useChannels((s) => s.channels);
  const groups = useChannels((s) => s.groups);
  // 本地单选 chips 态："all" = 全部；其余为分组 key（含 "ungrouped"）；跨页面保留
  const [chip, setChipState] = useState(lastChip);
  const setChip = (k: string) => {
    lastChip = k;
    setChipState(k);
  };
  const chipOptions = [
    { key: "all", name: "全部" },
    { key: "ungrouped", name: "默认分组" },
    ...groups.map((g) => ({ key: g.id, name: g.name })),
  ];
  // 列表左右滑切换分组（与 chips 同序；首尾边界不循环，见 useSwipeSwitch）。
  // 切换带过渡：先滑入骨架屏 240ms，动画结束才切分组发真实请求
  const chipIndex = Math.max(0, chipOptions.findIndex((g) => g.key === chip));
  const [swipeAnim, setSwipeAnim] = useState<"next" | "prev" | null>(null);
  const swipeRef = useSwipeSwitch<HTMLDivElement>({
    count: chipOptions.length,
    index: chipIndex,
    onChange: (next) => {
      if (swipeAnim !== null) return;
      setSwipeAnim(next > chipIndex ? "next" : "prev");
      window.setTimeout(() => {
        setChip(chipOptions[next].key);
        setSwipeAnim(null);
      }, 240);
    },
  });
  // 头像联动：顶部博主岛只显示当前选中分组下的博主（全部 = 全部；未分组 = 无分组）
  const shownChannels =
    chip === "all"
      ? channels
      : chip === "ungrouped"
        ? channels.filter((c) => !c.groupId)
        : channels.filter((c) => c.groupId === chip);

  useEffect(() => {
    if (status === "idle") void load();
  }, [status, load]);

  // chip 变化即重拉（桌面端确认按钮触发，这里单选 chips 直达）。
  // 首次挂载跳过：切页返回时 status 已 ready，直接复用 store 数据，不自动刷新
  const chipMounted = useRef(false);
  useEffect(() => {
    if (!chipMounted.current) {
      chipMounted.current = true;
      return;
    }
    if (chip === "all") {
      if (selectedGroups !== null) setSelectedGroups(null);
    } else if (selectedGroups?.length !== 1 || selectedGroups[0] !== chip) {
      setSelectedGroups([chip]);
    }
    if (status === "ready") void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip]);


  // 触顶下拉刷新（首页同款）：列表滚动到顶部继续下拉才重拉订阅流；
  // 切页返回不触发刷新（见上方 chip effect 的首挂载跳过）
  const PULL_TRIGGER_PX = 70;
  const PULL_MAX_PX = 110;
  const PULL_DAMP = 0.45;
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
          void load().finally(() => {
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
  }, [refreshing, load]);

  const refreshHint = refreshing ? "刷新中…" : pull >= PULL_TRIGGER_PX ? "松手刷新" : "下拉刷新";

  return (
    <div className="m-page relative">
      {/* 触顶下拉刷新指示条 */}
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
      {/* 固定头：博主横滑岛（桌面右栏博主岛的移动形态；点击进博主主页）+ 分组 chips，
          sticky 常驻不随列表滚动（首页 m-chips 同款做法） */}
      <div className="sticky top-0 z-10 bg-surface">
        {shownChannels.length > 0 && (
          <div className="flex gap-3.5 overflow-x-auto border-b border-line bg-surface px-3.5 py-3">
            {shownChannels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/channel/${c.id}`)}
                className="flex w-15 shrink-0 flex-col items-center gap-1.5"
              >
                {c.thumb ? (
                  <Img
                    src={c.thumb}
                    alt=""
                    className="h-13 w-13 shrink-0 rounded-full bg-flat object-cover"
                  />
                ) : (
                  <AvatarBadge name={c.title} size={52} />
                )}
                <span className="w-15 truncate text-center text-[10.5px] text-ink-2">
                  {c.title}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 分组筛选 chips（单选直达，持久化经 selectedGroups） */}
        <div className="flex gap-2 overflow-x-auto border-b border-line bg-surface px-3.5 py-2.5">
          {chipOptions.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setChip(g.key)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                chip === g.key ? "bg-accent/10 font-bold text-accent" : "bg-flat text-ink-2"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </div>

      {/* 更新流：列表区左右滑切换分组（手势只绑此处，不碰顶部横滑岛/chips） */}
      <div ref={swipeRef}>
      {swipeAnim !== null ? (
        /* 切换过渡：骨架屏从滑动方向滑入，动画结束才切分组发真实请求 */
        <div className={swipeAnim === "next" ? "m-swipe-next" : "m-swipe-prev"}>
          <RowSkeleton />
        </div>
      ) : failed.length > 0 && (
        <p className="bg-flat px-3.5 py-2 text-[11px] text-ink-3">
          {failed.length} 个频道更新拉取失败：{failed.slice(0, 3).join("、")}
          {failed.length > 3 ? " 等" : ""}
        </p>
      )}

      {swipeAnim === null &&
        (status === "loading" || status === "idle" ? (
          /* 加载期沿用骨架屏（骨架即 loading，不再闪一帧 Spinner） */
          <RowSkeleton />
        ) : status === "error" ? (
          <ErrorState desc={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          <EmptyState
            illust="▤"
            title={chip === "all" ? "还没有订阅博主" : "分组内暂无更新"}
            desc={chip === "all" ? "在观看页点「添加订阅」，或从桌面端导入订阅" : "这个分组下的博主还没有新视频"}
            action={chip === "all" ? { label: "⌕ 去搜索", onClick: () => navigate("/search") } : undefined}
          />
        ) : (
          <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
            {items.map((v, i) => (
              <RowCard key={videoIdOf(v) ?? i} video={v} />
            ))}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
