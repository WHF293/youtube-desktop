import { useState } from "react";
import {
  useWatchLater,
  WATCH_LATER_STATUS,
  WATCH_LATER_STATUS_ORDER,
  type WatchLaterStatus,
} from "../../common/stores/watchLater";
import BottomSheet from "../components/BottomSheet";
import { EmptyState } from "../components/StateViews";
import { HistoryCard } from "./History";

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

/** 移动端待看页：行卡流 + 状态角标（点开 sheet 切 待看/看一半/看完）+ ✕ 移除（两步确认） */
export default function WatchLaterView() {
  const { entries, remove, setStatus } = useWatchLater();
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  const target = entries.find((e) => e.videoId === removing);
  const statusTarget = entries.find((e) => e.videoId === statusFor);

  const askRemove = (videoId: string) => {
    setRemoving(videoId);
    setConfirmOpen(true);
  };

  return (
    <div className="m-page">
      {entries.length === 0 ? (
        <EmptyState illust="◷" title="待看清单还是空的" desc="刷到感兴趣的视频，点「◷ 待看」就能存进这里" />
      ) : (
        <>
          <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
            {entries.map((e) => (
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
            ))}
          </div>
          <p className="py-4 text-center text-xs text-ink-3">
            共 {entries.length} 个 · 待看 {entries.filter((e) => e.status === "todo").length}
          </p>
        </>
      )}

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
