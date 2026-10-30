import { Fragment, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ScrollTopFab from "../../common/components/ScrollTopFab";
import RefreshFab from "../../common/components/RefreshFab";
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
  const { items, failed, status, error, selectedGroups, setSelectedGroups, load, visible, hasMore, loadMore } =
    useSubsFeed();
  const channels = useChannels((s) => s.channels);
  const groups = useChannels((s) => s.groups);
  // 本地单选 chips 态："all" = 全部；其余为分组 key（含 "ungrouped"）。
  // 初始值优先恢复持久化的分组筛选（subsFeed store partialize 已落盘，杀进程重开
  // 仍保留——2026-10-30 王总指定「选分组 a 杀死重开还是 a」；PC 多选勾选时取第一个
  // key；key 已被删组失效则回退）；lastChip 仅兜底同进程内切页返回
  const [chip, setChipState] = useState(() => {
    const sel = useSubsFeed.getState().selectedGroups;
    if (sel && sel.length > 0 && (sel[0] === "ungrouped" || groups.some((g) => g.id === sel[0])))
      return sel[0];
    return lastChip;
  });
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
  // swiper 式：拖拽跟手 + 两侧骨架屏随动，松手过阈值滑入相邻骨架屏、动画结束才发
  // 真实请求，不够回弹
  const chipIndex = Math.max(0, chipOptions.findIndex((g) => g.key === chip));
  const { ref: swipeRef, phase: swipePhase, containerStyle } = useSwipeSwitch<HTMLDivElement>({
    count: chipOptions.length,
    index: chipIndex,
    onChange: (next) => setChip(chipOptions[next].key),
  });
  // 头像联动：顶部博主岛只显示当前选中分组下的博主。
  // 「全部」按分组顺序展平：默认分组在前（组内原顺序），自定义分组按排序跟随
  //（groups 数组顺序，管理页拖拽排序后即时联动），分组之间用竖线分隔
  const shownSections =
    chip === "all"
      ? [
          { key: "ungrouped", list: channels.filter((c) => !c.groupId) },
          ...groups.map((g) => ({ key: g.id, list: channels.filter((c) => c.groupId === g.id) })),
        ].filter((s) => s.list.length > 0)
      : [
          {
            key: chip,
            list:
              chip === "ungrouped"
                ? channels.filter((c) => !c.groupId)
                : channels.filter((c) => c.groupId === chip),
          },
        ];

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


  // 触底加载下一批（提前 600px 预取）：滚动容器是 #m-scroll（首页同款 scroll 方案，
  // IntersectionObserver 在 WebView2 实测不触发）。分页是本地切片扩窗——RSS 逐频道聚合
  // 无服务端 continuation，loadMore 同步执行、无网络请求，不会重复请求或死循环
  useEffect(() => {
    if (status !== "ready") return;
    const scroller = document.getElementById("m-scroll");
    if (!scroller) return;
    const check = () => {
      if (hasMore && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 600) {
        loadMore();
      }
    };
    check(); // 挂载/扩窗后立即查一次：首屏未填满时也能续载
    scroller.addEventListener("scroll", check, { passive: true });
    return () => scroller.removeEventListener("scroll", check);
  }, [status, visible, hasMore, loadMore]);

  return (
    <div className="m-page relative">
      {/* 固定头：博主横滑岛（桌面右栏博主岛的移动形态；点击进博主主页）+ 分组 chips，
          sticky 常驻不随列表滚动（首页 m-chips 同款做法） */}
      <div className="sticky top-0 z-10 bg-surface">
        {shownSections.length > 0 && (
          <div className="flex gap-3.5 overflow-x-auto border-b border-line bg-surface px-3.5 py-3">
            {shownSections.map((s, si) => (
              <Fragment key={s.key}>
                {/* 相邻分组之间的竖线分隔（ink-3 弱化色，深浅色都可见但不抢眼） */}
                {si > 0 && <span aria-hidden="true" className="h-13 w-px shrink-0 self-center bg-ink-3/40" />}
                {s.list.map((c) => (
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
              </Fragment>
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

      {/* 更新流：列表区左右滑切换分组（手势只绑此处，不碰顶部横滑岛/chips）。
          swiper 式容器：pan-y + overflow-x-clip，拖拽/过渡期间挂载两侧骨架屏面板 */}
      <div ref={swipeRef} className="relative overflow-x-clip" style={{ touchAction: "pan-y" }}>
        <div style={containerStyle}>
          {swipePhase !== null && chipIndex > 0 && (
            <div className="absolute inset-y-0 right-full w-full">
              <RowSkeleton />
            </div>
          )}
          {swipePhase !== null && chipIndex < chipOptions.length - 1 && (
            <div className="absolute inset-y-0 left-full w-full">
              <RowSkeleton />
            </div>
          )}

          {failed.length > 0 && (
            <p className="bg-flat px-3.5 py-2 text-[11px] text-ink-3">
              {failed.length} 个频道更新拉取失败：{failed.slice(0, 3).join("、")}
              {failed.length > 3 ? " 等" : ""}
            </p>
          )}

          {status === "loading" || status === "idle" ? (
            /* 加载期沿用骨架屏（骨架即 loading，不再闪一帧 Spinner） */
            <RowSkeleton />
          ) : status === "error" ? (
            <ErrorState desc={error} onRetry={() => void load(true)} />
          ) : items.length === 0 ? (
            <EmptyState
              illust="▤"
              title={chip === "all" ? "还没有订阅博主" : "分组内暂无更新"}
              desc={chip === "all" ? "在观看页点「添加订阅」，或从桌面端导入订阅" : "这个分组下的博主还没有新视频"}
              action={chip === "all" ? { label: "⌕ 去搜索", onClick: () => navigate("/search") } : undefined}
            />
          ) : (
            <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
              {/* 触底分页：只渲染可见窗口（数据层一次聚合，前端切片扩窗） */}
              {items.slice(0, visible).map((v, i) => (
                <RowCard key={videoIdOf(v) ?? i} video={v} />
              ))}
            </div>
          )}
          {items.length > 0 && !hasMore && (
            <p className="py-6 text-center text-xs text-ink-3">到底了 · 共 {items.length} 条更新</p>
          )}
        </div>
      </div>
      {/* 刷新固钉（回顶固钉上方 10px，取代下拉刷新手势）：force 清分组缓存重拉 */}
      <RefreshFab className="m-fab-top m-fab-refresh" onRefresh={() => load(true)} />
      <ScrollTopFab targetId="m-scroll" className="m-fab-top" />
    </div>
  );
}
