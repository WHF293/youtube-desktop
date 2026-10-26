import { useEffect, useState } from "react";
import { getVideoFormats, pickOptionByDefault, type FormatResult, type QualityOption } from "../lib/extract";
import { useDownloads } from "../stores/downloads";
import { useSettings } from "../stores/settings";
import { errorMessage } from "../stores/videos";
import Icon from "./Icon";
import { formatBytes } from "../lib/format";

/**
 * 下载清晰度选择弹窗：调 player 拿格式列表（ANDROID_VR 流），
 * 按设置页「默认清晰度」预选，确认后加入下载队列（单任务排队）。
 * 无降级方案：提取失败原样展示原因，可重试。
 */
export default function DownloadModal({
  meta,
  onClose,
}: {
  meta: { videoId: string; title: string; channelTitle: string; thumb: string; duration: string };
  onClose: () => void;
}) {
  const { defaultQuality } = useSettings();
  const enqueue = useDownloads((s) => s.enqueue);
  const [result, setResult] = useState<FormatResult | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<QualityOption | null>(null);
  const [starting, setStarting] = useState(false);

  const load = () => {
    setResult(null);
    setError("");
    setPicked(null);
    getVideoFormats(meta.videoId)
      .then((r) => {
        setResult(r);
        setPicked(pickOptionByDefault(r.options, defaultQuality));
      })
      .catch((e) => setError(errorMessage(e)));
  };

  useEffect(load, [meta.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    if (!picked || starting) return;
    setStarting(true);
    enqueue(meta, picked);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface p-4 shadow-island">
        <h3 className="text-sm font-semibold text-ink">下载视频</h3>
        <p className="mt-1 clamp-2 text-xs text-ink-3">{meta.title}</p>

        {result && picked && (
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {result.options.map((o) => (
              <label
                key={o.label}
                className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-flat ${
                  picked.label === o.label ? "bg-flat text-ink" : "text-ink-2"
                }`}
              >
                <input
                  type="radio"
                  name="dl-quality"
                  checked={picked.label === o.label}
                  onChange={() => setPicked(o)}
                  className="accent-[var(--color-accent)]"
                />
                <span className="w-20 shrink-0 font-medium">{o.label}</span>
                {o.fps && o.fps > 30 && <span className="shrink-0 text-xs text-ink-3">{o.fps}fps</span>}
                <span className="shrink-0 rounded bg-flat-strong px-1.5 py-0.5 text-[10px] text-ink-3">
                  {o.needsMerge ? "音视频合流" : "单文件"}
                </span>
                {o.codecNote && (
                  <span className="shrink-0 rounded bg-flat-strong px-1.5 py-0.5 text-[10px] text-ink-3">
                    {o.codecNote}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-ink-3">{formatBytes(o.sizeBytes)}</span>
              </label>
            ))}
            <p className="mt-2 text-[11px] leading-4 text-ink-3">
              保存到 {useSettings.getState().downloadDir}；合流由 ffmpeg 完成（首次使用会自动下载，约 35MB）。
            </p>
          </div>
        )}

        {!result && !error && (
          <div className="flex flex-col items-center gap-3 py-10 text-ink-2">
            <div className="h-7 w-7 animate-spin rounded-full border-line border-t-accent" style={{ borderWidth: 3 }} />
            <span className="text-xs">正在获取清晰度列表…</span>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-line bg-app p-3 text-xs leading-5 text-ink-2">
            <p className="flex items-center gap-1.5 font-medium text-ink">
              <Icon name="error" size={14} className="text-accent" />
              获取视频流失败
            </p>
            <p className="mt-1 break-all">{error}</p>
          </div>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          {error && (
            <button
              type="button"
              onClick={load}
              className="mr-auto rounded-full bg-flat px-3 py-1.5 text-xs text-ink hover:bg-flat-strong"
            >
              重试
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-flat px-3 py-1.5 text-xs text-ink hover:bg-flat-strong"
          >
            取消
          </button>
          <button
            type="button"
            onClick={start}
            disabled={!picked || starting}
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            开始下载
          </button>
        </div>
      </div>
    </div>
  );
}
