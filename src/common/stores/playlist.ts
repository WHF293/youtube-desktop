import { create } from "zustand";
import { ytApi } from "../lib/youtube";
import { errorMessage, type Status } from "./videos";
import type { VideoItem } from "../types/youtube";

/** 播放列表详情（PC /playlist/:playlistId 与移动端同页共用）：
 *  标题 + 视频列表 + InnerTube continuation 翻页（触底加载下一批） */
interface PlaylistState {
  playlistId: string | null;
  title: string;
  items: VideoItem[];
  status: Status;
  error: string;
  /** 翻页游标：null = 没有下一页 / 还没翻过 */
  nextPageToken: string | null;
  loadingMore: boolean;
  load: (playlistId: string) => Promise<void>;
  loadMore: () => Promise<void>;
}

export const usePlaylist = create<PlaylistState>()((set, get) => {
  let seq = 0;
  return {
    playlistId: null,
    title: "",
    items: [],
    status: "idle",
    error: "",
    nextPageToken: null,
    loadingMore: false,
    load: async (playlistId: string) => {
      const id = ++seq;
      set({
        playlistId,
        title: "",
        items: [],
        status: "loading",
        error: "",
        nextPageToken: null,
        loadingMore: false,
      });
      try {
        const { title, items, nextPageToken } = await ytApi.playlistVideosPage(playlistId);
        if (id !== seq) return;
        set({ title, items, nextPageToken, status: "ready" });
      } catch (e) {
        if (id !== seq) return;
        set({ status: "error", error: errorMessage(e) });
      }
    },
    loadMore: async () => {
      const { playlistId, nextPageToken, loadingMore, status } = get();
      if (!playlistId || !nextPageToken || loadingMore || status !== "ready") return;
      set({ loadingMore: true });
      const id = seq;
      try {
        const { items, nextPageToken: next } = await ytApi.playlistVideosPage(playlistId, nextPageToken);
        if (id !== seq) return;
        // 以 videoId 去重，防 continuation 交叠重复条目
        const seen = new Set(get().items.map((v) => v.etag));
        const fresh = items.filter((v) => !seen.has(v.etag));
        set((s) => ({ items: [...s.items, ...fresh], nextPageToken: next, loadingMore: false }));
      } catch (e) {
        if (id !== seq) return;
        set({ loadingMore: false, error: errorMessage(e) });
      }
    },
  };
});
