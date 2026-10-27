import { create } from "zustand";
import { ytApi } from "../lib/youtube";
import { errorMessage, type Status } from "./videos";
import type { ChannelItem, PlaylistItem, VideoItem } from "../types/youtube";

interface ChannelState {
  channelId: string | null;
  detail?: ChannelItem;
  videos: VideoItem[];
  playlists: PlaylistItem[];
  tab: "videos" | "playlists";
  status: Status;
  playlistsStatus: Status;
  error: string;
  load: (channelId: string) => Promise<void>;
  setTab: (tab: "videos" | "playlists") => void;
}

export const useChannel = create<ChannelState>()((set, get) => {
  let seq = 0;
  return {
    channelId: null,
    detail: undefined,
    videos: [],
    playlists: [],
    tab: "videos",
    status: "idle",
    playlistsStatus: "idle",
    error: "",
    load: async (channelId: string) => {
      const id = ++seq;
      set({
        channelId,
        detail: undefined,
        videos: [],
        playlists: [],
        tab: "videos",
        status: "loading",
        playlistsStatus: "idle",
        error: "",
      });
      try {
        const detail = await ytApi.channel(channelId);
        const videos = await ytApi.channelVideos(channelId, 24);
        if (id !== seq) return;
        set({ detail, videos, status: "ready" });
      } catch (e) {
        if (id !== seq) return;
        set({ status: "error", error: errorMessage(e) });
      }
    },
    setTab: (tab) => {
      set({ tab });
      // 播放列表懒加载：只拉一次
      const { channelId, playlists, playlistsStatus } = get();
      if (tab === "playlists" && channelId && playlists.length === 0 && playlistsStatus !== "loading") {
        set({ playlistsStatus: "loading" });
        const id = seq;
        ytApi.channelPlaylists(channelId, 24)
          .then((items) => {
            if (id !== seq) return;
            set({ playlists: items, playlistsStatus: "ready" });
          })
          .catch((e) => {
            if (id !== seq) return;
            set({ playlistsStatus: "error", error: errorMessage(e) });
          });
      }
    },
  };
});
