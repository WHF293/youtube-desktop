import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { errorMessage } from "./videos";

/**
 * 观看记录（本地 SQLite，tauri-plugin-sql）：
 * - 保留近 7 天，应用启动（init）时自动清理更早的记录；
 * - 同一视频重看只更新时间（置顶到新的日期分组，不留多条）；
 * - 记录失败静默（不打断观看）。
 */

/** 保留窗口：7 天 */
const RETAIN_MS = 7 * 24 * 3600 * 1000;

export interface HistoryEntry {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumb: string;
  duration: string;
  watchedAt: number;
}

interface HistoryRow {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumb: string;
  duration: string;
  watchedAt: number;
}

let db: Database | null = null;
let dbBroken = false;

async function getDb(): Promise<Database> {
  if (db) return db;
  if (dbBroken || !isTauri()) throw new Error("本地数据库不可用");
  db = await Database.load("sqlite:history.db");
  return db;
}

interface HistoryState {
  entries: HistoryEntry[];
  status: "idle" | "loading" | "ready" | "error";
  error: string;
  /** 应用启动 / 进入观看记录页时调用：清理 7 天前记录并加载 */
  init: () => Promise<void>;
  /** 观看页加载完成后记录（重看 = 置顶刷新时间） */
  record: (video: Omit<HistoryEntry, "watchedAt">) => Promise<void>;
  /** 按条删除观看记录 */
  remove: (videoId: string) => Promise<void>;
  /** 按天删除（传入该天任意一条记录的 watchedAt，删除其本地日期的全天记录） */
  removeDay: (watchedAt: number) => Promise<void>;
}

export const useHistory = create<HistoryState>()((set, get) => ({
  entries: [],
  status: "idle",
  error: "",

  init: async () => {
    if (get().status === "loading") return;
    set({ status: get().status === "ready" ? "ready" : "loading", error: "" });
    try {
      const d = await getDb();
      const cutoff = Date.now() - RETAIN_MS;
      await d.execute("DELETE FROM watch_history WHERE watched_at < $1", [cutoff]);
      const rows = await d.select<HistoryRow[]>(
        "SELECT video_id AS videoId, title, channel_id AS channelId, channel_title AS channelTitle, thumb, duration, watched_at AS watchedAt FROM watch_history WHERE watched_at >= $1 ORDER BY watched_at DESC LIMIT 500",
        [cutoff],
      );
      set({ entries: rows, status: "ready" });
    } catch (e) {
      set({ status: "error", error: errorMessage(e) });
    }
  },

  record: async (video) => {
    try {
      const d = await getDb();
      const now = Date.now();
      await d.execute(
        `INSERT INTO watch_history (video_id, title, channel_id, channel_title, thumb, duration, watched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT(video_id) DO UPDATE SET
           title = $2, channel_id = $3, channel_title = $4, thumb = $5, duration = $6, watched_at = $7`,
        [video.videoId, video.title, video.channelId, video.channelTitle, video.thumb, video.duration, now],
      );
      // 本地同步：重看的视频置顶到列表头
      set({
        entries: [{ ...video, watchedAt: now }, ...get().entries.filter((e) => e.videoId !== video.videoId)],
      });
    } catch {
      /* 记录失败不打断观看 */
    }
  },

  remove: async (videoId) => {
    try {
      const d = await getDb();
      await d.execute("DELETE FROM watch_history WHERE video_id = $1", [videoId]);
    } catch {
      /* DB 异常时仍同步本地视图，下次 init 会再对齐 */
    }
    set({ entries: get().entries.filter((e) => e.videoId !== videoId) });
  },

  removeDay: async (watchedAt) => {
    const start = new Date(watchedAt);
    start.setHours(0, 0, 0, 0);
    const startTime = start.getTime();
    const endTime = startTime + 86_400_000;
    try {
      const d = await getDb();
      await d.execute("DELETE FROM watch_history WHERE watched_at >= $1 AND watched_at < $2", [
        startTime,
        endTime,
      ]);
    } catch {
      /* 同上 */
    }
    set({ entries: get().entries.filter((e) => e.watchedAt < startTime || e.watchedAt >= endTime) });
  },
}));
