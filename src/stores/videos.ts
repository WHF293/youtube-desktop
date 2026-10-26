import { create } from "zustand";
import { ytApi } from "../lib/youtube";
import { useSettings } from "./settings";
import type { VideoItem } from "../types/youtube";

export type Status = "idle" | "loading" | "ready" | "error";

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/** 多语言结果交错合并（每语言取一个轮询），并按视频 id 去重 */
function interleave(groups: VideoItem[][]): VideoItem[] {
  const seen = new Set<string>();
  const out: VideoItem[] = [];
  const maxLen = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < maxLen; i++) {
    for (const g of groups) {
      const v = g[i];
      if (!v) continue;
      const id = typeof v.id === "string" ? v.id : v.id.videoId;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(v);
      }
    }
  }
  return out;
}

interface VideosState {
  mode: "popular" | "search";
  query: string;
  /** popular 当前分类（videoCategoryId）；undefined = 全部 */
  category: string | undefined;
  items: VideoItem[];
  status: Status;
  error: string;
  /** 下一页 token；null 表示没有更多了（search 多语言时为聚合标记） */
  nextPageToken: string | null;
  loadingMore: boolean;
  loadPopular: (categoryId?: string) => Promise<void>;
  loadMorePopular: () => Promise<void>;
  loadSearch: (q: string) => Promise<void>;
  loadMoreSearch: () => Promise<void>;
}

/** 首页推荐（mostPopular）与搜索结果共用一个集合，mode 区分来源 */
export const useVideos = create<VideosState>()((set, get) => {
  let seq = 0;

  // search 多语言分页状态（closure 内部用，不进 store）
  let searchLangs: string[] = [];
  let searchTokens: Record<string, string | null> = {};

  const langs = () => {
    const l = useSettings.getState().languages;
    return l.length > 0 ? l : ["en"];
  };

  const runPopular = async (id: number, category?: string) => {
    // loadingMore 必须一并重置：切分类打断上一次触底加载时，卡住的 true 会让后续触底永久失效
    set({ mode: "popular", query: "", category, status: "loading", error: "", nextPageToken: null, loadingMore: false });
    try {
      const { regionCode } = useSettings.getState();
      const r = await ytApi.mostPopularPage(24, regionCode, undefined, category);
      if (id !== seq) return; // 过期响应
      set({ items: r.items, status: "ready", nextPageToken: r.nextPageToken });
    } catch (e) {
      if (id !== seq) return;
      set({ items: [], status: "error", error: errorMessage(e), nextPageToken: null });
    }
  };

  const runSearch = async (id: number, q: string) => {
    set({ mode: "search", query: q, status: "loading", error: "", nextPageToken: null, loadingMore: false });
    try {
      searchLangs = langs();
      searchTokens = {};
      // 每语言并行搜索（relevanceLanguage 偏好 + hl 本地化），交错合并
      const results = await Promise.all(
        searchLangs.map((lang) =>
          ytApi.searchVideosPage(q, 10, undefined, { relevanceLanguage: lang, hl: lang }),
        ),
      );
      if (id !== seq) return;
      let hasMore = false;
      searchLangs.forEach((lang, i) => {
        searchTokens[lang] = results[i].nextPageToken;
        if (results[i].nextPageToken) hasMore = true;
      });
      set({
        items: interleave(results.map((r) => r.items)),
        status: "ready",
        nextPageToken: hasMore ? "more" : null,
      });
    } catch (e) {
      if (id !== seq) return;
      set({ items: [], status: "error", error: errorMessage(e), nextPageToken: null });
    }
  };

  return {
    mode: "popular",
    query: "",
    category: undefined,
    items: [],
    status: "idle",
    error: "",
    nextPageToken: null,
    loadingMore: false,

    loadPopular: (categoryId?: string) => {
      const id = ++seq;
      return runPopular(id, categoryId);
    },

    loadSearch: (q: string) => {
      const id = ++seq;
      return runSearch(id, q);
    },

    loadMorePopular: async () => {
      const { nextPageToken, loadingMore, category } = get();
      if (loadingMore || !nextPageToken) return;
      set({ loadingMore: true });
      try {
        const { regionCode } = useSettings.getState();
        const r = await ytApi.mostPopularPage(24, regionCode, nextPageToken, category);
        const current = get();
        if (current.mode !== "popular") return; // 期间切换了列表
        const seen = new Set(
          current.items.map((v) => (typeof v.id === "string" ? v.id : v.id.videoId)),
        );
        const fresh = r.items.filter((v) => {
          const id = typeof v.id === "string" ? v.id : v.id.videoId;
          return id && !seen.has(id);
        });
        set({
          items: [...current.items, ...fresh],
          nextPageToken: r.nextPageToken,
          loadingMore: false,
        });
      } catch {
        // 加载更多失败不打断现有列表，token 保留以便重试
        set({ loadingMore: false });
      }
    },

    loadMoreSearch: async () => {
      const { mode, query, loadingMore } = get();
      if (mode !== "search" || loadingMore) return;
      const pending = Object.entries(searchTokens).filter(([, t]) => t) as [string, string][];
      if (pending.length === 0) return;
      set({ loadingMore: true });
      try {
        const results = await Promise.all(
          pending.map(([lang, token]) =>
            ytApi
              .searchVideosPage(query, 10, token, { relevanceLanguage: lang, hl: lang })
              .then((r) => ({ lang, ok: true as const, items: r.items, token: r.nextPageToken }))
              .catch(() => ({ lang, ok: false as const, items: [], token })),
          ),
        );
        const current = get();
        if (current.mode !== "search" || current.query !== query) return; // 期间切换了列表
        for (const r of results) {
          if (r.ok) searchTokens[r.lang] = r.token; // 失败的语言保留旧 token 供重试
        }
        const fresh = interleave(results.map((r) => r.items));
        const seen = new Set(
          current.items.map((v) => (typeof v.id === "string" ? v.id : v.id.videoId)),
        );
        const hasMore = Object.values(searchTokens).some(Boolean);
        set({
          items: [
            ...current.items,
            ...fresh.filter((v) => {
              const id = typeof v.id === "string" ? v.id : v.id.videoId;
              return id && !seen.has(id);
            }),
          ],
          nextPageToken: hasMore ? "more" : null,
          loadingMore: false,
        });
      } catch {
        set({ loadingMore: false });
      }
    },
  };
});
