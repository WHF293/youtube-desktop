import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 待看（稍后再看）：本地 localStorage 存储（zustand persist），无 API 依赖。
 * 入口：观看页收藏星标左侧的钟表 icon；管理：待看页（状态标签 + 移除）。
 */

/** 观看进度状态：待看（绿）/ 看一半（黄）/ 看完（蓝），标签点击循环切换 */
export type WatchLaterStatus = "todo" | "half" | "done";

export const WATCH_LATER_STATUS: Record<WatchLaterStatus, { label: string; tagCls: string }> = {
  todo: { label: "待看", tagCls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  half: { label: "看一半", tagCls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  done: { label: "看完", tagCls: "bg-sky-500/15 text-sky-600 dark:text-sky-400" },
};

/** select 的选项序（与 WATCH_LATER_STATUS 的 key 对齐） */
export const WATCH_LATER_STATUS_ORDER: WatchLaterStatus[] = ["todo", "half", "done"];

export interface WatchLaterEntry {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumb: string;
  duration: string;
  addedAt: number;
  status: WatchLaterStatus;
}

interface WatchLaterState {
  entries: WatchLaterEntry[];
  has: (videoId: string) => boolean;
  /** 加入待看；已存在则刷新时间置顶（状态保留） */
  add: (video: Omit<WatchLaterEntry, "addedAt" | "status">) => void;
  remove: (videoId: string) => void;
  /** 直接设置状态（待看页 select 选择） */
  setStatus: (videoId: string, status: WatchLaterStatus) => void;
}

export const useWatchLater = create<WatchLaterState>()(
  persist(
    (set, get) => ({
      entries: [],
      has: (videoId) => get().entries.some((e) => e.videoId === videoId),
      add: (video) => {
        const { entries } = get();
        const now = Date.now();
        const exist = entries.find((e) => e.videoId === video.videoId);
        if (exist) {
          set({
            entries: [
              { ...exist, ...video, addedAt: now },
              ...entries.filter((e) => e.videoId !== video.videoId),
            ],
          });
          return;
        }
        set({ entries: [{ ...video, addedAt: now, status: "todo" }, ...entries] });
      },
      remove: (videoId) => set({ entries: get().entries.filter((e) => e.videoId !== videoId) }),
      setStatus: (videoId, status) =>
        set({
          entries: get().entries.map((e) => (e.videoId === videoId ? { ...e, status } : e)),
        }),
    }),
    { name: "yt-desktop-watchlater" },
  ),
);
