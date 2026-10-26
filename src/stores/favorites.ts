import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 收藏的视频（快照关键字段，离线可见） */
export interface FavVideo {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumb?: string;
  addedAt: string;
  /** 收藏分组 id；undefined = 默认分组 */
  groupId?: string;
}

export interface FavGroup {
  id: string;
  name: string;
}

interface FavoritesState {
  videos: FavVideo[];
  groups: FavGroup[];
  isFav: (videoId: string) => boolean;
  add: (video: Omit<FavVideo, "addedAt" | "groupId">, groupId?: string) => void;
  remove: (videoId: string) => void;
  setGroup: (videoId: string, groupId: string | undefined) => void;
  addGroup: (name: string) => string;
  removeGroup: (id: string) => void;
}

const newGroupId = () => `fg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export const useFavorites = create<FavoritesState>()(
  persist(
    (set, get) => ({
      videos: [],
      groups: [],
      isFav: (videoId) => get().videos.some((v) => v.videoId === videoId),
      add: (video, groupId) => {
        const { videos } = get();
        if (videos.some((v) => v.videoId === video.videoId)) return;
        set({ videos: [{ ...video, addedAt: new Date().toISOString(), groupId }, ...videos] });
      },
      remove: (videoId) => set({ videos: get().videos.filter((v) => v.videoId !== videoId) }),
      setGroup: (videoId, groupId) =>
        set({ videos: get().videos.map((v) => (v.videoId === videoId ? { ...v, groupId } : v)) }),
      addGroup: (name) => {
        const g: FavGroup = { id: newGroupId(), name: name.trim() };
        set({ groups: [...get().groups, g] });
        return g.id;
      },
      removeGroup: (id) =>
        set({
          groups: get().groups.filter((g) => g.id !== id),
          videos: get().videos.map((v) => (v.groupId === id ? { ...v, groupId: undefined } : v)),
        }),
    }),
    { name: "yt-desktop-favorites" },
  ),
);
