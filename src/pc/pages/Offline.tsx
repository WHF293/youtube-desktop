import { useCallback, useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { Link } from "react-router-dom";
import { openPath } from "@tauri-apps/plugin-opener";
import { useDownloads } from "../../common/stores/downloads";
import { useSettings } from "../../common/stores/settings";
import { errorMessage } from "../../common/stores/videos";
import { registerPageRefresh } from "../../common/lib/refresh";
import type { ManifestEntry } from "../../common/types/offline";
import Img from "../../common/components/Img";
import Icon from "../../common/components/Icon";
import Spinner, { ErrorBox } from "../../common/components/Spinner";
import { formatBytes } from "../../common/lib/format";

/**
 * 离线视频页（读取设置里的下载目录，不依赖网络）：
 * - 正在下载 / 失败：来自内存下载队列（进度条、取消、重试）；
 * - 下载完成：清单 ∩ 目录扫描交叉校验（文件被手动删除即不展示），点击本地播放（asset 协议）。
 */

/** 完成任务卡片（本地文件，缩略图走 asset 协议） */
function DoneCard({
  entry,
  dir,
  onDeleted,
  confirmKey,
  setConfirmKey,
}: {
  entry: ManifestEntry;
  dir: string;
  onDeleted: () => void;
  confirmKey: string | null;
  setConfirmKey: (k: string | null) => void;
}) {
  const thumbSrc = entry.thumbPath ? convertFileSrc(entry.thumbPath) : "";
  const deleteId = `d_${entry.videoId}`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-app p-2">
      <Link to={`/offline/watch/${entry.videoId}`} className="relative shrink-0">
        {thumbSrc ? (
          <img src={thumbSrc} alt="" className="h-12 w-20 rounded-lg bg-flat object-cover" draggable={false} />
        ) : (
          <span className="flex h-12 w-20 items-center justify-center rounded-lg bg-flat">
            <Icon name="play" size={16} className="text-ink-3" />
          </span>
        )}
      </Link>
      <Link to={`/offline/watch/${entry.videoId}`} className="min-w-0 flex-1">
        <span className="clamp-2 block text-sm font-medium text-ink">{entry.title}</span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">
          {entry.channelTitle}
          {entry.channelTitle && " · "}
          {entry.quality}
          {entry.duration && ` · ${entry.duration}`}
          {formatBytes(entry.size) && ` · ${formatBytes(entry.size)}`}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => void openPath(dir)}
        title="打开下载文件夹"
        aria-label="打开下载文件夹"
        className="shrink-0 rounded-full p-1.5 text-ink-3 transition-colors hover:bg-flat hover:text-ink"
      >
        <Icon name="folder" size={15} />
      </button>
      {confirmKey === deleteId ? (
        <button
          type="button"
          onClick={() => {
            void invoke("delete_offline_video", { dir, videoId: entry.videoId, filename: entry.filename })
              .then(onDeleted)
              .catch(() => onDeleted());
            setConfirmKey(null);
          }}
          title="再次点击确认删除（含本地文件）"
          className="shrink-0 rounded px-1 text-xs font-medium text-accent"
        >
          确认删除
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmKey(deleteId)}
          title="删除本地文件"
          aria-label={`删除 ${entry.title}`}
          className="shrink-0 rounded-full p-1 text-ink-3 transition-colors hover:bg-flat hover:text-accent"
        >
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

export default function Offline() {
  const downloadDir = useSettings((s) => s.downloadDir);
  const tasks = useDownloads((s) => s.tasks);
  const completedTick = useDownloads((s) => s.completedTick);
  const cancel = useDownloads((s) => s.cancel);
  const retry = useDownloads((s) => s.retry);
  const dismiss = useDownloads((s) => s.dismiss);

  const [entries, setEntries] = useState<ManifestEntry[] | null>(null);
  const [error, setError] = useState("");
  const [confirmKey, setConfirmKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setError("");
    Promise.all([
      invoke<{ videos: ManifestEntry[] }>("read_download_manifest", { dir: downloadDir }),
      invoke<string[]>("list_download_dir", { dir: downloadDir }),
    ])
      .then(([manifest, files]) => {
        const fileSet = new Set(files);
        setEntries((manifest.videos ?? []).filter((v) => fileSet.has(v.filename)));
      })
      .catch((e) => setError(errorMessage(e)));
  }, [downloadDir]);

  useEffect(load, [load, completedTick]);

  // 右下角刷新固钉：重新扫描清单与下载目录
  useEffect(() => registerPageRefresh("/offline", load), [load]);

  useEffect(() => {
    if (!confirmKey) return;
    const t = setTimeout(() => setConfirmKey(null), 3000);
    return () => clearTimeout(t);
  }, [confirmKey]);

  const active = tasks.filter((t) => t.status === "queued" || t.status === "downloading" || t.status === "muxing");
  const failed = tasks.filter((t) => t.status === "failed" || t.status === "cancelled");

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Icon name="download" size={18} className="text-accent" />
            离线视频
          </h1>
          <button
            type="button"
            onClick={() => void openPath(downloadDir)}
            className="flex items-center gap-1.5 rounded-lg glass-btn px-3 py-1.5 text-xs text-ink-2 transition-colors hover:brightness-110 hover:text-ink"
          >
            <Icon name="folder" size={14} />
            打开文件夹
          </button>
        </div>
        <p className="mt-1 text-xs text-ink-3">下载目录：{downloadDir}（设置页可修改）</p>

        {error && <ErrorBox message={error} onRetry={load} />}

        {/* 模块一：正在下载（含队列与失败） */}
        <section className="mt-4">
          <h2 className="text-sm font-medium text-ink-2">正在下载（{active.length + failed.length}）</h2>
          <div className="mt-2 flex flex-col gap-2">
            {active.map((t) => (
              <div key={t.videoId} className="rounded-xl border border-line bg-app p-2">
                <div className="flex items-center gap-3">
                  {t.thumb ? (
                    <Img src={t.thumb} alt="" className="h-12 w-20 shrink-0 rounded-lg bg-flat object-cover" />
                  ) : (
                    <span className="h-12 w-20 shrink-0 rounded-lg bg-flat" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="clamp-2 text-sm font-medium text-ink">{t.title}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-3">
                      {t.quality}
                      {t.duration && ` · ${t.duration}`}
                      {t.status === "muxing" ? " · 正在合流…" : t.status === "queued" ? " · 排队中" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void cancel(t.videoId)}
                    title="取消下载"
                    className="shrink-0 rounded-full p-1 text-ink-3 transition-colors hover:bg-flat hover:text-accent"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
                {t.status !== "queued" && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-flat-strong">
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-300"
                      style={{ width: `${Math.min(100, Math.max(2, t.percent))}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
            {failed.map((t) => (
              <div key={t.videoId} className="rounded-xl border border-line bg-app p-2">
                <div className="flex items-center gap-3">
                  {t.thumb ? (
                    <Img src={t.thumb} alt="" className="h-12 w-20 shrink-0 rounded-lg bg-flat object-cover" />
                  ) : (
                    <span className="h-12 w-20 shrink-0 rounded-lg bg-flat" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="clamp-2 text-sm font-medium text-ink">{t.title}</p>
                    <p className="mt-0.5 clamp-2 text-xs text-ink-3">
                      {t.quality} · 下载失败：{t.error ?? "未知原因"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void retry(t.videoId)}
                    title="重试（重新提取流地址）"
                    className="shrink-0 rounded-lg glass-btn px-2.5 py-1 text-xs text-ink transition-colors hover:brightness-110"
                  >
                    重试
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(t.videoId)}
                    title="移除任务"
                    className="shrink-0 rounded-full p-1 text-ink-3 transition-colors hover:bg-flat hover:text-accent"
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              </div>
            ))}
            {active.length === 0 && failed.length === 0 && (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-5 text-ink-3">
                暂无下载任务：在视频播放页点击下载图标选择清晰度即可离线观看。
              </p>
            )}
          </div>
        </section>

        {/* 模块二：下载完成（清单 ∩ 目录扫描） */}
        <section className="mt-5">
          <h2 className="text-sm font-medium text-ink-2">下载完成（{entries?.length ?? 0}）</h2>
          {entries === null && !error && (
            <Spinner label="扫描下载目录…" />
          )}
          {entries !== null && (
            <div className="mt-2 flex flex-col gap-2">
              {entries.map((v) => (
                <DoneCard
                  key={v.videoId}
                  entry={v}
                  dir={downloadDir}
                  onDeleted={load}
                  confirmKey={confirmKey}
                  setConfirmKey={setConfirmKey}
                />
              ))}
              {entries.length === 0 && (
                <p className="rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-5 text-ink-3">
                  这里还没有已完成的视频。手动删除的文件不会再展示。
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
