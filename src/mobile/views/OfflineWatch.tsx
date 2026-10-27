import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useSettings } from "../../common/stores/settings";
import Spinner from "../../common/components/Spinner";
import { EmptyState } from "../components/StateViews";
import Icon from "../../common/components/Icon";
import type { ManifestEntry } from "../../common/types/offline";

/** 移动端离线观看页：asset 协议加载本地 mp4（<video> 原生播放，无网络依赖） */
export default function OfflineWatchView() {
  const { videoId = "" } = useParams();
  const navigate = useNavigate();
  const downloadDir = useSettings((s) => s.downloadDir);
  const [entry, setEntry] = useState<ManifestEntry | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    invoke<{ videos: ManifestEntry[] }>("read_download_manifest", { dir: downloadDir })
      .then((r) => {
        const hit = r.videos.find((v) => v.videoId === videoId) ?? null;
        setEntry(hit);
        setStatus(hit ? "ready" : "error");
      })
      .catch(() => setStatus("error"));
  }, [downloadDir, videoId]);

  return (
    <div className="bg-app">
      {status === "loading" ? (
        <Spinner label="加载离线视频…" />
      ) : status === "error" || !entry ? (
        <EmptyState illust="⭳" title="视频不存在" desc="可能已被删除，去「我的 → 离线下载」看看" />
      ) : (
        <>
          <div className="relative bg-black">
            <video
              controls
              autoPlay
              className="aspect-video w-full"
              src={convertFileSrc(entry.path)}
              poster={entry.thumbPath ? convertFileSrc(entry.thumbPath) : undefined}
            />
            <button
              type="button"
              aria-label="返回"
              onClick={() => navigate(-1)}
              className="absolute left-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white"
            >
              <Icon name="arrowLeft" size={18} />
            </button>
          </div>
          <div className="bg-surface px-3.5 py-3">
            <h1 className="clamp-2 text-[15px] font-extrabold leading-[1.45]">{entry.title}</h1>
            <p className="mt-1 text-[11.5px] text-ink-2">
              {entry.channelTitle} · {entry.quality}
              {` · ${(entry.size / 1024 / 1024).toFixed(0)} MB`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
