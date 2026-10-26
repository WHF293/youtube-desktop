import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSettings } from "../stores/settings";
import type {
  ApiError,
  ChannelItem,
  CommentThreadItem,
  PlaylistItem,
  SubscriptionItem,
  VideoItem,
} from "../types/youtube";

const BASE = "https://www.googleapis.com/youtube/v3";

export type Params = Record<string, string | number | undefined>;

export class YoutubeApiError extends Error {
  reason?: string;
  code?: number;
  constructor(message: string, reason?: string, code?: number) {
    super(message);
    this.name = "YoutubeApiError";
    this.reason = reason;
    this.code = code;
  }
}

/** 原始 GET：桌面端走 Rust reqwest（支持设置页代理），网页端走浏览器自身网络栈 */
async function httpGet(url: string): Promise<{ status: number; body: string }> {
  if (isTauri()) {
    const { proxy } = useSettings.getState();
    return invoke<{ status: number; body: string }>("yt_fetch", { url, proxy });
  }
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

/** 统一请求入口：自动带上 settings 里的 API Key；带 auth 的端点改用 accessToken */
async function request<T>(endpoint: string, params: Params, useAuth = false): Promise<T> {
  const { apiKey, accessToken } = useSettings.getState();
  const merged: Params = { ...params };
  if (useAuth) {
    if (!accessToken) {
      throw new YoutubeApiError("缺少 OAuth access token，请到「设置」里配置", "missingToken");
    }
    merged.access_token = accessToken;
  } else {
    if (!apiKey) {
      throw new YoutubeApiError("缺少 YouTube Data API Key，请到「设置」里配置", "missingApiKey");
    }
    merged.key = apiKey;
  }

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v !== undefined && v !== "") qs.set(k, String(v));
  }

  const { status, body: raw } = await httpGet(`${BASE}/${endpoint}?${qs.toString()}`);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new YoutubeApiError(`响应不是合法 JSON（HTTP ${status}）`, undefined, status);
  }
  if (status < 200 || status >= 300) {
    const err = (body as { error?: ApiError })?.error;
    throw new YoutubeApiError(
      err?.message ?? `请求失败（HTTP ${status}）`,
      err?.errors?.[0]?.reason,
      err?.code ?? status,
    );
  }
  return body as T;
}

/** 把 search/activities 返回的 snippet 结果用 videos 端点补齐 statistics + duration */
async function hydrateVideos(items: VideoItem[]): Promise<VideoItem[]> {
  const ids = items
    .map((it) => (typeof it.id === "string" ? it.id : it.id.videoId))
    .filter((v): v is string => Boolean(v));
  if (ids.length === 0) return items;

  const detail = await request<{ items: VideoItem[] }>("videos", {
    part: "statistics,contentDetails",
    id: ids.join(","),
  });
  const byId = new Map(detail.items.map((v) => [typeof v.id === "string" ? v.id : "", v]));
  return items.map((it) => {
    const id = typeof it.id === "string" ? it.id : it.id.videoId;
    const stat = id ? byId.get(id) : undefined;
    return stat ? { ...it, statistics: stat.statistics, contentDetails: stat.contentDetails } : it;
  });
}

export const ytApi = {
  /** 热门/流行视频（chart=mostPopular），直接带 statistics；返回 nextPageToken 供分页 */
  async mostPopularPage(
    maxResults = 24,
    regionCode?: string,
    pageToken?: string,
  ): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
    const data = await request<{ items: VideoItem[]; nextPageToken?: string }>("videos", {
      part: "snippet,statistics,contentDetails",
      chart: "mostPopular",
      maxResults,
      regionCode,
      pageToken,
    });
    return { items: data.items, nextPageToken: data.nextPageToken ?? null };
  },

  /** 兼容旧调用：只要列表 */
  async mostPopular(maxResults = 24, regionCode?: string): Promise<VideoItem[]> {
    return (await ytApi.mostPopularPage(maxResults, regionCode)).items;
  },

  /** 关键词搜索（分页版），并补齐 statistics/contentDetails */
  async searchVideosPage(
    q: string,
    maxResults = 25,
    pageToken?: string,
    extra?: Params,
  ): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
    const data = await request<{ items: VideoItem[]; nextPageToken?: string }>("search", {
      part: "snippet",
      type: "video",
      maxResults,
      q,
      pageToken,
      ...extra,
    });
    return {
      items: await hydrateVideos(data.items),
      nextPageToken: data.nextPageToken ?? null,
    };
  },

  /** 兼容旧调用：只要列表 */
  async searchVideos(q: string, maxResults = 25, extra?: Params): Promise<VideoItem[]> {
    return (await ytApi.searchVideosPage(q, maxResults, undefined, extra)).items;
  },

  /** 某频道最新视频（order=date），补齐 statistics */
  async channelVideos(channelId: string, maxResults = 24): Promise<VideoItem[]> {
    const data = await request<{ items: VideoItem[] }>("search", {
      part: "snippet",
      type: "video",
      channelId,
      order: "date",
      maxResults,
    });
    return hydrateVideos(data.items);
  },

  async videoDetail(videoId: string): Promise<VideoItem | undefined> {
    const data = await request<{ items: VideoItem[] }>("videos", {
      part: "snippet,statistics,contentDetails",
      id: videoId,
    });
    return data.items[0];
  },

  async channel(channelId: string): Promise<ChannelItem | undefined> {
    const data = await request<{ items: ChannelItem[] }>("channels", {
      part: "snippet,statistics,brandingSettings",
      id: channelId,
    });
    return data.items[0];
  },

  async channelPlaylists(channelId: string, maxResults = 24): Promise<PlaylistItem[]> {
    const data = await request<{ items: PlaylistItem[] }>("playlists", {
      part: "snippet,contentDetails",
      channelId,
      maxResults,
    });
    return data.items;
  },

  async playlistItems(playlistId: string, maxResults = 25): Promise<VideoItem[]> {
    const data = await request<{ items: VideoItem[] }>("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults,
    });
    // playlistItems 只有 snippet/contentDetails，补 statistics
    const ids = data.items.map((it) => it.contentDetails?.videoId).filter((v): v is string => Boolean(v));
    if (ids.length === 0) return [];
    const detail = await request<{ items: VideoItem[] }>("videos", {
      part: "statistics,contentDetails",
      id: ids.join(","),
    });
    const byId = new Map(detail.items.map((v) => [typeof v.id === "string" ? v.id : "", v]));
    return data.items
      .map((it) => {
        const vid = it.contentDetails?.videoId ?? "";
        const d = byId.get(vid);
        if (!d) return undefined;
        return { ...d, snippet: it.snippet } as VideoItem;
      })
      .filter((v): v is VideoItem => Boolean(v));
  },

  async commentThreads(videoId: string, maxResults = 20): Promise<CommentThreadItem[]> {
    const data = await request<{ items: CommentThreadItem[] }>("commentThreads", {
      part: "snippet",
      videoId,
      maxResults,
      order: "relevance",
      textFormat: "plainText",
    });
    return data.items;
  },

  /** 我的订阅（需 access token） */
  async mySubscriptions(maxResults = 50): Promise<SubscriptionItem[]> {
    const data = await request<{ items: SubscriptionItem[] }>("subscriptions", {
      part: "snippet",
      mine: "true",
      maxResults,
    }, true);
    return data.items;
  },

  /** 用 key 验证连通性：拿 1 条视频 */
  async ping(): Promise<boolean> {
    await request<{ items: unknown[] }>("videos", {
      part: "id",
      chart: "mostPopular",
      maxResults: 1,
    });
    return true;
  },
};
