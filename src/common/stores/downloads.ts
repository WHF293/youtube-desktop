import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getVideoFormats, pickOptionByDefault, type QualityOption } from "../lib/extract";
import { errorMessage } from "./videos";
import { useSettings } from "./settings";

/**
 * 视频下载队列（单任务并发，Rust 同一时刻只跑一个任务）：
 * - enqueue 后由 pump 依次启动；进度经 video-download-progress 事件回灌；
 * - 完成的任务从本 store 移除（离线页以清单文件为准）；
 * - 应用重启时未完成任务标记为失败（流地址不缓存，重试会重新提取）。
 */

export type DlStatus = "queued" | "downloading" | "muxing" | "failed" | "cancelled";

export interface DlTask {
  videoId: string;
  title: string;
  channelTitle: string;
  thumb: string;
  duration: string;
  /** 选定清晰度（重试时优先匹配同档位） */
  quality: string;
  dir: string;
  status: DlStatus;
  percent: number;
  error?: string;
  createdAt: number;
}

export interface DownloadProgressEvent {
  id: string;
  stage: "video" | "audio" | "mux" | "ffmpeg" | "done" | "cancelled" | "error";
  percent: number;
  error?: string | null;
  filename?: string | null;
}

export interface DownloadMeta {
  videoId: string;
  title: string;
  channelTitle: string;
  thumb: string;
  duration: string;
}

/** 排队任务的流地址（内存中，不入持久化；重启后重试会重新提取） */
const pendingOptions = new Map<string, QualityOption>();

/** 进度事件监听挂载（App 启动时调用一次），返回解绑函数 */
export async function initDownloads(): Promise<() => void> {
  const unlisten = await listen<DownloadProgressEvent>("video-download-progress", (e) => {
    useDownloads.getState().applyProgress(e.payload);
  });
  // 上次运行未完成的任务：流地址已随进程消失，统一标记失败
  useDownloads.getState().markInterrupted();
  void useDownloads.getState().pump();
  return unlisten;
}

interface DownloadsState {
  tasks: DlTask[];
  /** 完成计数（离线页监听其变化以刷新清单） */
  completedTick: number;
  enqueue: (meta: DownloadMeta, option: QualityOption) => void;
  cancel: (videoId: string) => Promise<void>;
  retry: (videoId: string) => Promise<void>;
  dismiss: (videoId: string) => void;
  applyProgress: (p: DownloadProgressEvent) => void;
  markInterrupted: () => void;
  pump: () => Promise<void>;
}

export const useDownloads = create<DownloadsState>()(
  persist(
    (set, get) => {
      const update = (videoId: string, patch: Partial<DlTask>) =>
        set({ tasks: get().tasks.map((t) => (t.videoId === videoId ? { ...t, ...patch } : t)) });

      return {
        tasks: [],
        completedTick: 0,

        enqueue: (meta, option) => {
          const { downloadDir } = useSettings.getState();
          if (get().tasks.some((t) => t.videoId === meta.videoId)) return;
          pendingOptions.set(meta.videoId, option);
          set({
            tasks: [
              ...get().tasks,
              {
                videoId: meta.videoId,
                title: meta.title,
                channelTitle: meta.channelTitle,
                thumb: meta.thumb,
                duration: meta.duration,
                quality: option.label,
                dir: downloadDir,
                status: "queued",
                percent: 0,
                createdAt: Date.now(),
              },
            ],
          });
          void get().pump();
        },

        pump: async () => {
          const { tasks } = get();
          if (tasks.some((t) => t.status === "downloading" || t.status === "muxing")) return;
          const next = tasks.find((t) => t.status === "queued");
          if (!next) return;
          const option = pendingOptions.get(next.videoId);
          if (!option) {
            update(next.videoId, { status: "failed", error: "流地址丢失，请重试（将重新提取）" });
            return;
          }
          const { proxy, ffmpegPath } = useSettings.getState();
          update(next.videoId, { status: "downloading", percent: 0, error: undefined });
          try {
            await invoke("start_video_download", {
              task: {
                videoId: next.videoId,
                title: next.title,
                channelTitle: next.channelTitle,
                duration: next.duration,
                thumbUrl: next.thumb,
                dir: next.dir,
                quality: option.label,
                needsMerge: option.needsMerge,
                videoUrl: option.videoUrl,
                videoSize: Math.round(option.sizeBytes * (option.needsMerge ? 0.85 : 1)),
                audioUrl: option.audioUrl ?? null,
                audioSize: option.needsMerge ? Math.round(option.sizeBytes * 0.15) : 0,
                ffmpegPath: ffmpegPath || null,
              },
              proxy,
            });
          } catch (e) {
            update(next.videoId, { status: "failed", error: errorMessage(e) });
            void get().pump(); // 启动失败不堵队列，继续下一个
          }
        },

        cancel: async (videoId) => {
          const task = get().tasks.find((t) => t.videoId === videoId);
          if (!task) return;
          if (task.status === "queued") {
            set({ tasks: get().tasks.filter((t) => t.videoId !== videoId) });
            return;
          }
          try {
            await invoke("cancel_video_download", { videoId });
          } catch {
            /* 取消失败等事件回调处理 */
          }
        },

        retry: async (videoId) => {
          const task = get().tasks.find((t) => t.videoId === videoId);
          if (!task || task.status === "downloading" || task.status === "muxing" || task.status === "queued") return;
          // 流地址不缓存：先提取再排队（排队必须有 option，否则 pump 会误判失败）
          update(videoId, { status: "failed", error: "正在重新提取流地址…" });
          try {
            const r = await getVideoFormats(videoId);
            const { defaultQuality } = useSettings.getState();
            const same = r.options.find((o) => o.label === task.quality);
            const option = same ?? pickOptionByDefault(r.options, defaultQuality);
            pendingOptions.set(videoId, option);
            update(videoId, {
              status: "queued",
              percent: 0,
              error: undefined,
              quality: option.label,
              title: r.title || task.title,
            });
            void get().pump();
          } catch (e) {
            update(videoId, { status: "failed", error: errorMessage(e) });
          }
        },

        dismiss: (videoId) => set({ tasks: get().tasks.filter((t) => t.videoId !== videoId) }),

        applyProgress: (p) => {
          const task = get().tasks.find((t) => t.videoId === p.id);
          if (!task) return;
          if (p.stage === "done") {
            set({
              tasks: get().tasks.filter((t) => t.videoId !== p.id),
              completedTick: get().completedTick + 1,
            });
            pendingOptions.delete(p.id);
            void get().pump();
            return;
          }
          if (p.stage === "cancelled") {
            update(p.id, { status: "cancelled", percent: 0, error: "已取消" });
            void get().pump();
            return;
          }
          if (p.stage === "error") {
            update(p.id, { status: "failed", error: p.error ?? "下载失败" });
            void get().pump();
            return;
          }
          update(p.id, {
            status: p.stage === "mux" || p.stage === "ffmpeg" ? "muxing" : "downloading",
            percent: p.percent,
          });
        },

        markInterrupted: () => {
          const stale = get().tasks.filter((t) =>
            t.status === "queued" || t.status === "downloading" || t.status === "muxing",
          );
          if (stale.length === 0) return;
          set({
            tasks: get().tasks.map((t) =>
              t.status === "queued" || t.status === "downloading" || t.status === "muxing"
                ? { ...t, status: "failed", error: "应用重启导致中断，可重试（重新提取流地址）" }
                : t,
            ),
          });
        },
      };
    },
    { name: "yt-desktop-downloads" },
  ),
);
