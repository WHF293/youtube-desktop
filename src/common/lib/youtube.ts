import * as ft from "./innertube";
import type { ChannelItem, CommentThreadItem, PlaylistItem, VideoItem } from "../types/youtube";

/**
 * 数据层门面（FreeTube 模式）：官方 YouTube Data API 已于 2026-10-26 下线，
 * 全部数据走 InnerTube 接口 + 频道 RSS（无配额、无需凭证）。
 * 方法签名与原官方 API 版保持一致，store / 页面无需感知；
 * 官方 API 的历史实现见 git 历史（v0.1.1）。
 */
export type Params = Record<string, string | number | undefined>;

/** 新闻分类（videoCategoryId=25）改走 InnerTube 搜索（地区化 + 时效排序）；
 *  其余分类为精选频道组 RSS（全球固定，见 innertube.ts FT_HOME_GROUPS） */
export const NEWS_CATEGORY_ID = "25";

export const ytApi = {
  /** 首页：内置频道组 RSS 聚合，pageToken 为页码（分类「新闻」走搜索地区化） */
  async mostPopularPage(
    _maxResults = 24,
    _regionCode?: string,
    pageToken?: string,
    videoCategoryId?: string,
  ): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
    if (videoCategoryId === NEWS_CATEGORY_ID) return ft.ftNewsPage(pageToken);
    return ft.ftPopularPage(videoCategoryId, pageToken);
  },

  /** 兼容旧调用：只要列表 */
  async mostPopular(maxResults = 24, regionCode?: string): Promise<VideoItem[]> {
    return (await ytApi.mostPopularPage(maxResults, regionCode)).items;
  },

  /** 关键词搜索（分页）；extra.hl 用于多语言交错搜索 */
  async searchVideosPage(
    q: string,
    _maxResults = 25,
    pageToken?: string,
    extra?: Params,
  ): Promise<{ items: VideoItem[]; nextPageToken: string | null }> {
    return ft.ftSearchPage(q, pageToken, typeof extra?.hl === "string" ? extra.hl : undefined);
  },

  /** 兼容旧调用：只要列表 */
  async searchVideos(q: string, maxResults = 25, extra?: Params): Promise<VideoItem[]> {
    return (await ytApi.searchVideosPage(q, maxResults, undefined, extra)).items;
  },

  /** 某频道最新视频 */
  async channelVideos(channelId: string, _maxResults = 24): Promise<VideoItem[]> {
    return (await ft.ftChannelVideos(channelId)).items;
  },

  async videoDetail(videoId: string): Promise<VideoItem | undefined> {
    return ft.ftVideoDetail(videoId);
  },

  async channel(channelId: string): Promise<ChannelItem | undefined> {
    return ft.ftChannel(channelId);
  },

  async channelPlaylists(channelId: string, _maxResults = 24): Promise<PlaylistItem[]> {
    return ft.ftChannelPlaylists(channelId);
  },

  /** 播放列表详情（分页）：返回列表标题与视频项 */
  async playlistVideosPage(
    playlistId: string,
    pageToken?: string,
  ): Promise<{ title: string; items: VideoItem[]; nextPageToken: string | null }> {
    return ft.ftPlaylistVideos(playlistId, pageToken);
  },

  async commentThreads(videoId: string, _maxResults = 20): Promise<CommentThreadItem[]> {
    return ft.ftComments(videoId);
  },
};
