import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useHistory, type HistoryEntry } from "../stores/history";
import Img from "../components/Img";
import Icon from "../components/Icon";
import Spinner, { ErrorBox } from "../components/Spinner";

/** 观看记录页：按日期分组，今天自动展开，更早的日期默认收起（点击展开），时间倒序；
 *  仅保留近 7 天，应用打开时自动清理更早的记录（SQLite 本地库） */

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function dayLabel(key: string): string {
  if (key === dayKey(Date.now())) return "今天";
  if (key === dayKey(Date.now() - 86_400_000)) return "昨天";
  const [, m, d] = key.split("-");
  return `${m}月${d}日`;
}

function timeLabel(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function History() {
  const { entries, status, error, init } = useHistory();
  // 默认只展开今天；手动展开过的日期记住状态
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set([dayKey(Date.now())]));

  useEffect(() => {
    void init();
  }, [init]);

  const groups = useMemo(() => {
    const map = new Map<string, HistoryEntry[]>();
    for (const e of entries) {
      const key = dayKey(e.watchedAt);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    // entries 本身已是倒序，Map 保持插入序 = 日期从新到旧
    return [...map.entries()];
  }, [entries]);

  const toggle = (key: string) =>
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (status === "loading") return <Spinner label="加载观看记录…" />;
  if (status === "error") return <ErrorBox message={error} onRetry={() => void init()} />;

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon name="history" size={18} className="text-accent" />
          观看记录（{entries.length}）
        </h1>
        <p className="mt-1 text-xs text-ink-3">仅保留近 7 天，每次打开应用自动清理更早的记录。</p>

        {groups.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-2">
            <p className="font-medium text-ink">还没有观看记录</p>
            <p className="mt-2 leading-6">打开任意视频后，这里会按日期记录你的观看历史。</p>
          </div>
        )}

        {groups.map(([key, list]) => {
          const open = openKeys.has(key);
          return (
            <section key={key} className="mt-4">
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-flat"
              >
                <Icon
                  name="chevronRight"
                  size={14}
                  className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                />
                <span className="text-sm font-medium text-ink">{dayLabel(key)}</span>
                <span className="text-xs text-ink-3">（{list.length}）</span>
              </button>
              {/* 高度过渡的展开/收起 */}
              <div
                className="grid transition-[grid-template-rows] duration-200"
                style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col gap-2 pt-2">
                    {list.map((e) => (
                      <Link
                        key={e.videoId}
                        to={`/watch/${e.videoId}`}
                        className="flex items-center gap-3 rounded-xl border border-line bg-app p-2 transition-colors hover:bg-flat"
                      >
                        {e.thumb ? (
                          <span className="relative shrink-0">
                            <Img src={e.thumb} alt="" className="h-12 w-20 rounded-lg bg-flat object-cover" />
                            {e.duration && (
                              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/80 px-1 text-[10px] font-medium text-white">
                                {e.duration}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="h-12 w-20 shrink-0 rounded-lg bg-flat" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="clamp-2 block text-sm font-medium text-ink">{e.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-ink-3">
                            {e.channelTitle}
                            {e.channelTitle && " · "}
                            {timeLabel(e.watchedAt)}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
