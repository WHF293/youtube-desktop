import { useEffect } from "react";
import type { VideoItem } from "../types/youtube";
import { videoIdOf } from "../lib/format";

/**
 * 视频详情页「上一个 / 下一个」来源队列（模块级注册表，不进 zustand）：
 * 列表页（首页/搜索/博主页/订阅/待看/收藏/历史/播放列表/相关视频）挂载或数据变化时
 * 调 registerVideoNavQueue 注册当前列表顺序；Watch 页按当前 videoId 从最近注册的
 * 队列开始回溯，找到第一个包含它的队列，按其中位置得出相邻视频。
 * 只存内存：注册表常驻、LRU 淘汰（列表页路由切走后 Watch 页仍能回溯），无需持久化。
 */

/** 队列条目：精简为切换所需的最小字段（id + 标题），兼容 VideoItem 与本地收藏/待看/历史条目 */
export interface VideoNavEntry {
  id: string;
  title: string;
}

interface QueueEntry {
  key: string;
  videos: VideoNavEntry[];
  ts: number;
}

const MAX_QUEUES = 24;
const queues: QueueEntry[] = [];

/** VideoItem 数组 → 队列条目（videoId 解析失败的剔除） */
export function toNavEntries(videos: VideoItem[]): VideoNavEntry[] {
  const out: VideoNavEntry[] = [];
  for (const v of videos) {
    const id = videoIdOf(v);
    if (id) out.push({ id, title: v.snippet.title });
  }
  return out;
}

/** 注册来源队列（同 key 覆盖旧记录；空列表不注册，避免骨架屏期清掉有效队列） */
export function registerVideoNavQueue(key: string, videos: VideoNavEntry[]) {
  if (videos.length === 0) return;
  const i = queues.findIndex((q) => q.key === key);
  if (i >= 0) queues.splice(i, 1);
  queues.push({ key, videos, ts: Date.now() });
  while (queues.length > MAX_QUEUES) queues.shift();
}

/** React hook：列表页一行注册（items 引用变化即重注册）。卸载不注销——
 *  跳到 Watch 页后列表页可能已卸载，注册表常驻内存靠 LRU 淘汰 */
export function useVideoNavQueue(key: string, videos: VideoNavEntry[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    registerVideoNavQueue(key, videos);
  }, [key, videos]);
}

/** 相邻视频查询结果：prev/next 为 null 表示没有（队首/队尾/不在任何队列里） */
export interface VideoNavNeighbors {
  prev: VideoNavEntry | null;
  next: VideoNavEntry | null;
  /** 当前视频在命中队列中的位置（1 起），未命中为 0 */
  pos: number;
  /** 命中队列长度，未命中为 0 */
  total: number;
}

/** 按当前 videoId 查上一个/下一个：从最近注册的队列往前回溯，取第一个包含它的队列。
 *  同一视频出现在多个队列时（如既在首页又在博主页列表），注册时间新者优先——
 *  与用户「刚从哪个列表点进来」的直觉一致 */
export function getVideoNavNeighbors(videoId: string): VideoNavNeighbors {
  for (let i = queues.length - 1; i >= 0; i--) {
    const list = queues[i].videos;
    const idx = list.findIndex((e) => e.id === videoId);
    if (idx >= 0) {
      return {
        prev: idx > 0 ? list[idx - 1] : null,
        next: idx < list.length - 1 ? list[idx + 1] : null,
        pos: idx + 1,
        total: list.length,
      };
    }
  }
  return { prev: null, next: null, pos: 0, total: 0 };
}
