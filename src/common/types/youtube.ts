// YouTube Data API v3 相关类型（按本项目实际用到的字段裁剪）
export interface Thumbnail {
  url: string;
  width?: number;
  height?: number;
}

export interface Thumbnails {
  default?: Thumbnail;
  medium?: Thumbnail;
  high?: Thumbnail;
  standard?: Thumbnail;
  maxres?: Thumbnail;
}

export interface VideoSnippet {
  publishedAt: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  thumbnails: Thumbnails;
  tags?: string[];
  categoryId?: string;
  liveBroadcastContent?: string;
}

export interface VideoStatistics {
  viewCount?: string;
  likeCount?: string;
  dislikeCount?: string;
  favoriteCount?: string;
  commentCount?: string;
}

export interface VideoContentDetails {
  duration: string;
  definition?: string;
  caption?: string;
  /** playlistItems 端点返回该项 */
  videoId?: string;
}

export interface VideoItem {
  kind: string;
  etag: string;
  id: string | { videoId?: string; channelId?: string; playlistId?: string };
  snippet: VideoSnippet;
  statistics?: VideoStatistics;
  contentDetails?: VideoContentDetails;
}

export interface ChannelSnippet {
  title: string;
  description: string;
  customUrl?: string;
  publishedAt: string;
  thumbnails: Thumbnails;
  country?: string;
}

export interface ChannelStatistics {
  viewCount?: string;
  subscriberCount?: string;
  hiddenSubscriberCount?: boolean;
  videoCount?: string;
}

export interface ChannelBranding {
  image?: { bannerExternalUrl?: string };
  channel?: { keywords?: string };
}

export interface ChannelItem {
  id: string;
  snippet: ChannelSnippet;
  statistics?: ChannelStatistics;
  brandingSettings?: ChannelBranding;
}

/** InnerTube 搜索（Type=Channel 过滤）返回的频道卡片，订阅页「搜索博主直接添加订阅」用 */
export interface ChannelSearchResult {
  /** UC 开头的频道 id（channelRenderer 的 browseId），可直接用于本地订阅 */
  id: string;
  title: string;
  /** 频道头像（可为空串，UI 侧用首字占位兜底） */
  thumb: string;
  /** 订阅数（parseCountLoose 归一化后的数字串，如 "324000"；解析不出为 undefined） */
  subscribers?: string;
  /** 频道简介摘要（可空串） */
  description: string;
}

export interface PlaylistItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    publishedAt: string;
    channelId: string;
    channelTitle: string;
    thumbnails: Thumbnails;
    contentDetails?: { itemCount?: number };
  };
  contentDetails?: { itemCount: number };
}

export interface CommentSnippet {
  videoId?: string;
  textDisplay: string;
  textOriginal: string;
  authorDisplayName: string;
  authorProfileImageUrl: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
}

export interface CommentThreadItem {
  id: string;
  snippet: {
    channelId: string;
    videoId: string;
    topLevelComment: { id: string; snippet: CommentSnippet };
    totalReplyCount: number;
  };
}
