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
