import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SearchHistoryState {
  /** 最近搜索的关键词（去重前置顶，最多 8 条） */
  items: string[];
  remember: (q: string) => void;
  clear: () => void;
}

export const useSearchHistory = create<SearchHistoryState>()(
  persist(
    (set) => ({
      items: [],
      remember: (q) =>
        set((s) => ({
          items: [q, ...s.items.filter((i) => i !== q)].slice(0, 8),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: "yt-desktop-search-history" },
  ),
);
