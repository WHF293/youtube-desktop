import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useSettings } from "../../common/stores/settings";
import { RowSkeleton } from "../components/VideoCards";
import Img from "../../common/components/Img";
import { useDownloads } from "../../common/stores/downloads";
import type { ManifestEntry } from "../../common/types/offline";
import BottomSheet from "../components/BottomSheet";
import { EmptyState, ErrorState } from "../components/StateViews";

/** 移动端离线下载页：清单行卡 + 总占用 + 删除（BottomSheet 二次确认）。
 *  下载中任务经 downloads store 角标同步；进行中任务在此页展示进度条。 */
export default function OfflineView() {
  const navigate = useNavigate();
  const downloadDir = useSettings((s) => s.downloadDir);
  const [entries, setEntries] = useState<ManifestEntry[] | null>(null);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<ManifestEntry | null>(null);
  const tasks = useDownloads((s) => s.tasks);
  const completedTick = useDownloads((s) => s.completedTick);

  const refresh = useCallback(() => {
    invoke<{ videos: ManifestEntry[] }>("read_download_manifest", { dir: downloadDir })
      .then((r) => setEntries(r.videos))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [downloadDir]);

  useEffect(() => {
    refresh();
  }, [refresh, completedTick]);

  const totalMb = (entries ?? []).reduce((acc, e) => acc + e.size, 0) / 1024 / 1024;
  const activeTasks = tasks.filter((t) => t.status === "downloading" || t.status === "muxing");

  return (
    <div className="m-page">
      {error ? (
        <ErrorState title="清单读取失败" desc={error} onRetry={refresh} />
      ) : entries === null ? (
        <RowSkeleton rows={6} />
      ) : (
        <>
          {activeTasks.length > 0 && (
            <div className="border-b border-line bg-surface px-3.5 py-2.5">
              {activeTasks.map((t) => (
                <div key={t.videoId} className="mb-1.5 last:mb-0">
                  <p className="clamp-1 truncate text-[12px] font-semibold">
                    ⭳ {t.title}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded bg-flat">
                    <div
                      className="h-full rounded bg-accent transition-[width]"
                      style={{ width: `${t.percent ?? 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {entries.length === 0 && activeTasks.length === 0 ? (
            <EmptyState illust="⭳" title="还没有离线视频" desc="在观看页点「⭳ 下载」缓存第一个视频" />
          ) : (
            <>
              <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
                {entries.map((e) => (
                  <div key={e.videoId} className="relative">
                    <button
                      type="button"
                      onClick={() => navigate(`/offline/watch/${e.videoId}`)}
                      className="flex w-full gap-2.5 border-b border-line bg-surface px-3.5 py-2.5 text-left active:bg-flat"
                    >
                      <div className="relative aspect-video w-[142px] shrink-0 overflow-hidden rounded-xl bg-flat">
                        {e.thumbPath && (
                          <Img
                            src={e.thumbPath}
                            alt=""
                            className="aspect-video w-full object-cover"
                          />
                        )}
                        <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.5 text-[10px] font-bold text-white">
                          {e.quality}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="clamp-2 text-[13px] font-bold leading-[1.4]">{e.title}</p>
                        <p className="mt-1 truncate text-[11px] text-ink-2">{e.channelTitle}</p>
                        <p className="text-[10.5px] text-ink-3">
                          {(e.size / 1024 / 1024).toFixed(0)} MB · 已缓存
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label="删除离线视频"
                      onClick={() => setRemoving(e)}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-xs text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <p className="py-4 text-center text-xs text-ink-3">
                共 {entries.length} 个 · 占用 {totalMb.toFixed(0)} MB
              </p>
            </>
          )}
        </>
      )}

      <BottomSheet open={!!removing} onClose={() => setRemoving(null)} title="删除离线视频？">
        <p className="clamp-2 mb-3 text-[11.5px] text-ink-3">{removing?.title}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRemoving(null)}
            className="m-glass-btn flex-1 justify-center"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              if (removing) {
                void invoke("delete_offline_video", {
                  dir: downloadDir,
                  videoId: removing.videoId,
                  filename: removing.filename,
                }).then(refresh);
              }
              setRemoving(null);
            }}
            className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white"
          >
            删除
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
