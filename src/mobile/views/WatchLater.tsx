import { useState } from "react";
import { useWatchLater } from "../../common/stores/watchLater";
import BottomSheet from "../components/BottomSheet";
import { HistoryCard } from "./History";

/** 移动端待看页：行卡流 + ✕ 移除（两步确认，3 秒复位） */
export default function WatchLaterView() {
  const { entries, remove } = useWatchLater();
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const target = entries.find((e) => e.videoId === removing);

  const askRemove = (videoId: string) => {
    setRemoving(videoId);
    setConfirmOpen(true);
  };

  return (
    <div>
      {entries.length === 0 ? (
        <div className="m-placeholder !py-24">
          <b>待看清单还是空的</b>
          <span>刷到感兴趣的视频，点「◷ 待看」就能存进这里</span>
        </div>
      ) : (
        <>
          {entries.map((e) => (
            <div key={e.videoId} className="relative">
              <HistoryCard entry={{ ...e, watchedAt: e.addedAt }} />
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
          <p className="py-4 text-center text-xs text-ink-3">共 {entries.length} 个</p>
        </>
      )}
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
