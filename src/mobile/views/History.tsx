import { useState } from "react";
import { Link } from "react-router-dom";
import { useHistory, type HistoryEntry } from "../../common/stores/history";
import { useWatchLater } from "../../common/stores/watchLater";
import { useFavorites } from "../../common/stores/favorites";
import Img from "../../common/components/Img";
import { RowSkeleton } from "../components/VideoCards";
import BottomSheet from "../components/BottomSheet";
import { EmptyState, ErrorState } from "../components/StateViews";

/** 观看记录行包装：行内快捷收藏 ★（弹分组 sheet）/ 待看 ◷（点击即入，已入高亮） */
function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const wlHas = useWatchLater((s) => s.has);
  const wlAdd = useWatchLater((s) => s.add);
  const favVideos = useFavorites((s) => s.videos);
  const favAdd = useFavorites((s) => s.add);
  const [favOpen, setFavOpen] = useState(false);
  const inWl = wlHas(entry.videoId);
  const faved = favVideos.some((v) => v.videoId === entry.videoId);

  return (
    <>
      <div className="relative">
        <HistoryCard entry={entry} />
        <div className="flex gap-1.5 bg-surface px-3.5 pb-2.5">
          <button
            type="button"
            onClick={() => setFavOpen(true)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              faved ? "bg-accent/10 text-accent" : "bg-flat text-ink-2"
            }`}
          >
            {faved ? "★ 已收藏" : "★ 收藏"}
          </button>
          <button
            type="button"
            onClick={() =>
              inWl ||
              wlAdd({
                videoId: entry.videoId,
                title: entry.title,
                channelId: entry.channelId,
                channelTitle: entry.channelTitle,
                thumb: entry.thumb,
                duration: entry.duration,
              })
            }
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              inWl ? "bg-accent/10 text-accent" : "bg-flat text-ink-2"
            }`}
          >
            {inWl ? "◷ 已待看" : "◷ 待看"}
          </button>
        </div>
      </div>
      <FavGroupSheet
        open={favOpen}
        onClose={() => setFavOpen(false)}
        video={{ ...entry, thumb: entry.thumb || undefined }}
        faved={faved}
        onPick={(groupId) => {
          favAdd(
            {
              videoId: entry.videoId,
              title: entry.title,
              channelId: entry.channelId,
              channelTitle: entry.channelTitle,
              thumb: entry.thumb || undefined,
            },
            groupId,
          );
          setFavOpen(false);
        }}
      />
    </>
  );
}

/** 历史行卡主体（复用 RowCard 版式但直连 entry 数据；待看页也复用） */
export function HistoryCard({ entry }: { entry: HistoryEntry }) {
  return (
    <Link
      to={`/watch/${entry.videoId}`}
      className="flex gap-2.5 border-b border-line bg-surface px-3.5 pt-2.5 active:bg-flat"
    >
      <div className="relative aspect-video w-[142px] shrink-0 overflow-hidden rounded-xl bg-flat">
        {entry.thumb ? (
          /* 缩略图必须走代理 Img 组件（裸 img 直连 i.ytimg.com 在国内加载不出） */
          <Img src={entry.thumb} alt="" loading="lazy" className="aspect-video w-full object-cover" />
        ) : null}
        {entry.duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-bold text-white">
            {entry.duration}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="clamp-2 text-[13px] font-bold leading-[1.4] text-ink">{entry.title}</p>
        <p className="mt-1 truncate text-[11px] text-ink-2">{entry.channelTitle}</p>
        <p className="text-[10.5px] text-ink-3">
          {new Date(entry.watchedAt).toLocaleString("zh-CN", {
            month: "numeric",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          看过
        </p>
      </div>
    </Link>
  );
}

/** 收藏分组选择 sheet（收藏/换分组共用） */
export function FavGroupSheet({
  open,
  onClose,
  video,
  faved,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  video: { videoId: string; title: string; thumb?: string };
  faved: boolean;
  onPick: (groupId?: string) => void;
}) {
  // 收藏分组与博主分组是两套独立数据：这里必须用 useFavorites 的分组
  const groups = useFavorites((s) => s.groups);
  return (
    <BottomSheet open={open} onClose={onClose} title={faved ? "换到分组" : "收藏到分组"}>
      <p className="mb-2 clamp-2 text-[11.5px] text-ink-3">{video.title}</p>
      <button
        type="button"
        onClick={() => onPick(undefined)}
        className="mb-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-semibold"
      >
        默认分组
      </button>
      {groups.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => onPick(g.id)}
          className="mb-1.5 w-full rounded-xl border border-line px-3 py-2.5 text-left text-[13px] font-semibold"
        >
          {g.name}
        </button>
      ))}
    </BottomSheet>
  );
}

/** 按日分组的吸顶标题（今天/昨天/具体日期） */
function dayLabel(watchedAt: number): string {
  const d = new Date(watchedAt);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "今天";
  if (same(d, yesterday)) return "昨天";
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

/** 移动端历史页：按日分组（sticky 吸顶）+ 行内快捷收藏/待看 */
export default function HistoryView() {
  const { entries, status, error } = useHistory();

  const groupsByDay: Array<{ label: string; items: HistoryEntry[] }> = [];
  for (const e of entries) {
    const label = dayLabel(e.watchedAt);
    const last = groupsByDay.at(-1);
    if (last && last.label === label) last.items.push(e);
    else groupsByDay.push({ label, items: [e] });
  }

  return (
    <div className="m-page">
      {status === "loading" ? (
        /* 加载期骨架屏（与订阅页 RowSkeleton 同款，骨架即 loading） */
        <RowSkeleton />
      ) : status === "error" ? (
        <ErrorState title="观看记录加载失败" desc={error} />
      ) : entries.length === 0 ? (
        <EmptyState illust="↺" title="还没有观看记录" desc="看过的视频会按天留在这里，仅保留最近 7 天" />
      ) : (
        groupsByDay.map((g) => (
          <section key={g.label}>
            <h2 className="sticky top-0 z-[5] bg-app px-3.5 py-2 text-xs font-bold text-ink-2">
              {g.label}
            </h2>
            <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
              {g.items.map((e) => (
                <HistoryRow key={e.videoId} entry={e} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
