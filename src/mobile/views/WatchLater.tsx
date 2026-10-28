import { useEffect, useState } from "react";
import {
  useWatchLater,
  WATCH_LATER_STATUS,
  WATCH_LATER_STATUS_ORDER,
  type WatchLaterEntry,
  type WatchLaterStatus,
} from "../../common/stores/watchLater";
import Icon from "../../common/components/Icon";
import BottomSheet from "../components/BottomSheet";
import { EmptyState } from "../components/StateViews";
import { HistoryCard } from "./History";

/** 排序模式（模块级，跨页面保留）："time" = 自然排序（按添加时间）；
 *  "status" = 按观看状态分组（待看/看一半/看完，区块可展开收起） */
type SortMode = "time" | "status";
let lastSort: SortMode = "time";

/** 状态角标配色（实色，叠在缩略图上可读；与 PC 端三态语义一致） */
const STATUS_PILL: Record<WatchLaterStatus, string> = {
  todo: "bg-emerald-500",
  half: "bg-amber-500",
  done: "bg-sky-500",
};
const STATUS_DOT: Record<WatchLaterStatus, string> = {
  todo: "bg-emerald-500",
  half: "bg-amber-500",
  done: "bg-sky-500",
};

/** 移动端待看页：行卡流 + 状态角标（点开 sheet 切 待看/看一半/看完）+ ✕ 移除（两步确认）。
 *  navbar 漏斗图标切排序：自然排序（添加时间） / 按观看状态分组（可展开收起） */
export default function WatchLaterView() {
  const { entries, remove, setStatus } = useWatchLater();
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  // 排序模式 + 排序选择 sheet + 按状态分组时的区块收起态
  const [sort, setSort] = useState<SortMode>(lastSort);
  const [sortOpen, setSortOpen] = useState(false);
  const [closedSections, setClosedSections] = useState<Record<WatchLaterStatus, boolean>>({
    todo: false,
    half: false,
    done: false,
  });

  // navbar 漏斗图标在 MobileApp 内，经自定义事件唤起排序 sheet
  useEffect(() => {
    const open = () => setSortOpen(true);
    window.addEventListener("m-watchlater-sort", open);
    return () => window.removeEventListener("m-watchlater-sort", open);
  }, []);

  const pickSort = (m: SortMode) => {
    setSort(m);
    lastSort = m;
    setSortOpen(false);
  };

  // 按观看状态分组：组序固定 待看→看一半→看完，组内按添加时间倒序；空组不显示
  const statusSections = WATCH_LATER_STATUS_ORDER.map((s) => ({
    status: s,
    list: entries.filter((e) => e.status === s),
  })).filter((sec) => sec.list.length > 0);

  const target = entries.find((e) => e.videoId === removing);
  const statusTarget = entries.find((e) => e.videoId === statusFor);

  /** 行卡（自然排序与分组视图共用） */
  const entryCard = (e: WatchLaterEntry) => (
    <div key={e.videoId} className="relative">
      <HistoryCard entry={{ ...e, watchedAt: e.addedAt }} />
      {/* 进度状态角标：点开切换 待看/看一半/看完（对齐 PC 端状态下拉） */}
      <button
        type="button"
        aria-label="修改观看状态"
        onClick={() => setStatusFor(e.videoId)}
        className={`absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white shadow-sm ${STATUS_PILL[e.status]}`}
      >
        {WATCH_LATER_STATUS[e.status].label}
      </button>
      <button
        type="button"
        aria-label="移出待看"
        onClick={() => askRemove(e.videoId)}
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-xs text-white"
      >
        ✕
      </button>
    </div>
  );

  const askRemove = (videoId: string) => {
    setRemoving(videoId);
    setConfirmOpen(true);
  };

  return (
    <div className="m-page">
      {entries.length === 0 ? (
        <EmptyState illust="◷" title="待看清单还是空的" desc="刷到感兴趣的视频，点「◷ 待看」就能存进这里" />
      ) : sort === "status" ? (
        <>
          {/* 按观看状态分组：区块头（chevron 展开收起 + 计数）+ 区块间隔 */}
          {statusSections.map((sec, i) => {
            const open = !closedSections[sec.status];
            return (
              <section key={sec.status} className={i > 0 ? "mt-3" : ""}>
                <button
                  type="button"
                  onClick={() =>
                    setClosedSections((m) => ({ ...m, [sec.status]: !m[sec.status] }))
                  }
                  aria-expanded={open}
                  className="flex w-full items-center gap-1.5 border-b border-line bg-surface px-3.5 py-2.5 text-left"
                >
                  <Icon
                    name="chevronRight"
                    size={12}
                    className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                  />
                  <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[sec.status]}`} />
                  <span className="text-[12.5px] font-bold text-ink">
                    {WATCH_LATER_STATUS[sec.status].label}
                  </span>
                  <span className="text-[11.5px] text-ink-3">（{sec.list.length}）</span>
                </button>
                {/* 区块内行卡：grid-rows 高度过渡（订阅管理页同款） */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
                      {sec.list.map(entryCard)}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
          <p className="py-4 text-center text-xs text-ink-3">
            共 {entries.length} 个 · 待看 {entries.filter((e) => e.status === "todo").length}
          </p>
        </>
      ) : (
        <>
          {/* 自然排序：按添加时间倒序（store 追加置顶的原顺序） */}
          <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
            {entries.map(entryCard)}
          </div>
          <p className="py-4 text-center text-xs text-ink-3">
            共 {entries.length} 个 · 待看 {entries.filter((e) => e.status === "todo").length}
          </p>
        </>
      )}

      {/* 排序方式 sheet（navbar 漏斗图标唤起） */}
      <BottomSheet open={sortOpen} onClose={() => setSortOpen(false)} title="排序方式">
        <div className="mb-2 flex flex-col gap-1.5">
          {(
            [
              ["time", "自然排序", "按添加时间倒序，最新加入的在前"],
              ["status", "按观看状态分组", "待看 / 看一半 / 看完 分区块展示"],
            ] as const
          ).map(([m, label, desc]) => (
            <button
              key={m}
              type="button"
              onClick={() => pickSort(m)}
              className={`flex flex-col rounded-xl px-3.5 py-2.5 text-left ${
                sort === m ? "bg-flat" : ""
              }`}
            >
              <span className={`text-[13px] font-semibold ${sort === m ? "text-accent" : "text-ink"}`}>
                {label}
              </span>
              <span className="mt-0.5 text-[11px] text-ink-3">{desc}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* 状态切换 sheet（对齐 PC 端三态） */}
      <BottomSheet
        open={!!statusTarget}
        onClose={() => setStatusFor(null)}
        title="观看状态"
      >
        <p className="clamp-2 mb-3 text-[11.5px] text-ink-3">{statusTarget?.title}</p>
        <div className="mb-2 flex flex-col gap-1.5">
          {WATCH_LATER_STATUS_ORDER.map((s) => {
            const active = statusTarget?.status === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (statusTarget) setStatus(statusTarget.videoId, s);
                  setStatusFor(null);
                }}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-medium ${
                  active ? "bg-flat text-ink" : "text-ink-2"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT[s]}`} />
                  {WATCH_LATER_STATUS[s].label}
                </span>
                {active && <span className="text-[11px] text-accent">当前</span>}
              </button>
            );
          })}
        </div>
      </BottomSheet>

      <BottomSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="移出待看？"
      >
        <p className="clamp-2 mb-3 text-[11.5px] text-ink-3">{target?.title}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="m-glass-btn flex-1 justify-center"
          >
            保留
          </button>
          <button
            type="button"
            onClick={() => {
              if (removing) remove(removing);
              setConfirmOpen(false);
            }}
            className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white"
          >
            移出
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
