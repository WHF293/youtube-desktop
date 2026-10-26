import { useEffect, useState } from "react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useParams } from "react-router-dom";
import { useSettings } from "../stores/settings";
import { errorMessage } from "../stores/videos";
import type { ManifestEntry } from "../types/offline";
import Spinner, { ErrorBox } from "../components/Spinner";
import { openPath } from "@tauri-apps/plugin-opener";
import Icon from "../components/Icon";

/** 离线播放页：asset 协议加载本地 mp4（<video> 原生播放，无网络依赖） */
export default function OfflineWatch() {
  const { videoId = "" } = useParams();
  const downloadDir = useSettings((s) => s.downloadDir);
  const [entry, setEntry] = useState<ManifestEntry | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    setStatus("loading");
    invoke<{ videos: ManifestEntry[] }>("read_download_manifest", { dir: downloadDir })
      .then((m) => {
        const hit = (m.videos ?? []).find((v) => v.videoId === videoId);
        if (!hit) throw new Error("清单中找不到该视频（文件可能已被删除）");
        setEntry(hit);
        setStatus("ready");
      })
      .catch((e) => {
        setError(errorMessage(e));
        setStatus("error");
      });
  }, [videoId, downloadDir]);

  if (status === "loading") return <Spinner label="加载本地视频…" />;
  if (status === "error" || !entry) return <ErrorBox message={error} />;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-3 p-4">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
        <video
          key={entry.videoId}
          src={convertFileSrc(entry.path)}
          poster={entry.thumbPath ? convertFileSrc(entry.thumbPath) : undefined}
          controls
          autoPlay
          className="h-full w-full"
        />
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-6 text-ink">{entry.title}</h1>
          <p className="mt-1 truncate text-xs text-ink-3">
            {entry.channelTitle}
            {entry.channelTitle && " · "}
            {entry.quality}
            {entry.duration && ` · ${entry.duration}`}
            {" · 离线播放"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void openPath(downloadDir)}
          className="flex shrink-0 items-center gap-1.5 rounded-full glass-btn px-3 py-1.5 text-xs text-ink-2 transition-colors hover:brightness-110 hover:text-ink"
        >
          <Icon name="folder" size={14} />
          所在文件夹
        </button>
      </div>
    </div>
  );
}
