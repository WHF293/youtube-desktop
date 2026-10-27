import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useWatchLater,
  WATCH_LATER_STATUS,
  WATCH_LATER_STATUS_ORDER,
  type WatchLaterEntry,
  type WatchLaterStatus,
} from "../stores/watchLater";
import Img from "../components/Img";
import Icon from "../components/Icon";
import ConfirmDialog from "../components/ConfirmDialog";

/** 待看页（稍后再看）：行卡片样式对齐观看历史列表（缩略图 + 标题 + 频道 + 时间）；
 *  每条带进度状态 select（待看绿 / 看一半黄 / 看完蓝，下拉自选），右侧按钮移除 */

function timeLabel(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 缩略图兜底：早先落库的记录 thumb 可能为空（详情接口无缩略图字段），按 videoId 拼稳定 URL */
function thumbOf(e: { videoId: string; thumb: string }): string {
  return e.thumb || `https://i.ytimg.com/vi/${e.videoId}/mqdefault.jpg`;
}

function Row({ entry, onRemove }: { entry: WatchLaterEntry; onRemove: (e: WatchLaterEntry) => void }) {
  const setStatus = useWatchLater((s) => s.setStatus);
  const status = WATCH_LATER_STATUS[entry.status];
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-app p-2 transition-colors hover:bg-flat">
      <Link to={`/watch/${entry.videoId}`} className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative shrink-0">
          <Img src={thumbOf(entry)} alt="" className="h-12 w-20 rounded-lg bg-flat object-cover" />
          {entry.duration && (
            <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px] font-medium text-white">
              {entry.duration}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="clamp-2 block text-sm font-medium text-ink">{entry.title}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-3">
            {entry.channelTitle}
            {entry.channelTitle && " · "}
            {timeLabel(entry.addedAt)}
          </span>
        </span>
      </Link>
      {/* 进度状态：select 自选（待看 / 看一半 / 看完），外层按状态着色 */}
      <span className={`shrink-0 inline-flex items-center rounded-full ${status.tagCls}`}>
        <select
          value={entry.status}
          onChange={(e) => setStatus(entry.videoId, e.target.value as WatchLaterStatus)}
          aria-label="观看状态"
          title="选择观看状态"
          className="cursor-pointer appearance-none bg-transparent py-1 pl-2.5 pr-2 text-xs font-medium outline-none"
        >
          {WATCH_LATER_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {WATCH_LATER_STATUS[s].label}
            </option>
          ))}
        </select>
      </span>
      <button
        type="button"
        onClick={() => onRemove(entry)}
        title="从待看移除"
        aria-label={`移出待看 ${entry.title}`}
        className="shrink-0 rounded-full p-1.5 text-ink-3 transition-colors hover:bg-flat hover:text-accent"
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

export default function WatchLater() {
  const entries = useWatchLater((s) => s.entries);
  const remove = useWatchLater((s) => s.remove);
  const [confirmRemove, setConfirmRemove] = useState<WatchLaterEntry | null>(null);

  const todoCount = entries.filter((e) => e.status === "todo").length;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon name="watchLater" size={18} className="text-accent" />
          待看（{entries.length}）
        </h1>
        <p className="mt-1 text-xs text-ink-3">
          观看页点钟表 icon 加入；用状态下拉标记 待看 / 看一半 / 看完。
          {entries.length > 0 && ` 其中待看 ${todoCount} 条。`}
        </p>

        {entries.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-2">
            <p className="font-medium text-ink">待看列表是空的</p>
            <p className="mt-2 leading-6">在视频详情页点收藏星标左侧的钟表 icon，即可把视频加入待看。</p>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {entries.map((e) => (
            <Row key={e.videoId} entry={e} onRemove={setConfirmRemove} />
          ))}
        </div>

        {/* 移除二次确认 */}
        {confirmRemove && (
          <ConfirmDialog
            title="移出待看？"
            message={confirmRemove.title}
            confirmText="移出"
            onConfirm={() => {
              remove(confirmRemove.videoId);
              setConfirmRemove(null);
            }}
            onCancel={() => setConfirmRemove(null)}
          />
        )}
      </div>
    </div>
  );
}
