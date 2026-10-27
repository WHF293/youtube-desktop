/** 离线视频清单条目（Rust 侧 write_manifest_entry 写入，camelCase） */
export interface ManifestEntry {
  videoId: string;
  title: string;
  channelTitle: string;
  duration: string;
  quality: string;
  filename: string;
  thumb: string;
  thumbPath: string;
  size: number;
  path: string;
  downloadedAt: number;
}
