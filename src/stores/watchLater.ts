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

/** 状态循环顺序：待看 → 看一半 → 看完 → 待看 */
const NEXT_STATUS: Record<WatchLaterStatus, WatchLaterStatus> = {
  todo: "half",
  half: "done",
  done: "todo",
};

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
  /** 切换到下一个状态（点击标签循环） */
  cycleStatus: (videoId: string) => void;
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
      cycleStatus: (videoId) =>
        set({
          entries: get().entries.map((e) =>
            e.videoId === videoId ? { ...e, status: NEXT_STATUS[e.status] } : e,
          ),
        }),
    }),
    { name: "yt-desktop-watchlater" },
  ),
);
