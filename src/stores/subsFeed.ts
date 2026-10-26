import { create } from "zustand";
import { ftSubscriptionsFeed, ftChannel } from "../lib/innertube";
import { errorMessage, type Status } from "./videos";
import { useChannels, titleLooksBroken } from "./channels";
import type { VideoItem } from "../types/youtube";

/** FreeTube 模式订阅流：本地频道列表的 RSS 聚合（无登录态）。
 *  加载顺带自愈本地坏数据：头像缺失 + 标题损坏（历史版本 CSV 导入错位的产物）
 *  用 ftChannel 的远端正确数据覆盖并持久化 */
interface SubsFeedState {
  items: VideoItem[];
  /** 拉取失败（RSS 404 / 网络抖动）的频道标题 */
  failed: string[];
  status: Status;
  error: string;
  load: () => Promise<void>;
}

export const useSubsFeed = create<SubsFeedState>()((set) => {
  let seq = 0;
  return {
    items: [],
    failed: [],
    status: "idle",
    error: "",
    load: async () => {
      const id = ++seq;
      const channels = useChannels.getState().channels;
      if (channels.length === 0) {
        set({ items: [], failed: [], status: "ready", error: "" });
        return;
      }
      set({ status: "loading", error: "" });
      try {
        const { videos, failedIds } = await ftSubscriptionsFeed(channels.map((c) => c.id));
        if (id !== seq) return;
        const titleOf = (cid: string) => channels.find((c) => c.id === cid)?.title ?? cid;
        set({
          items: videos,
          failed: failedIds.map(titleOf),
          status: "ready",
          error: "",
        });
      } catch (e) {
        if (id !== seq) return;
        set({ status: "error", error: errorMessage(e) });
      }
      // 数据自愈：不阻塞视频流展示，失败静默（下次进页面再试）。
      // 对头像缺失或标题损坏的频道，用 ftChannel 的远端数据覆盖并持久化。
      const pending = useChannels.getState().channels.filter((c) => !c.thumb || titleLooksBroken(c.title, c.id));
      const queue = [...pending];
      void Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          for (;;) {
            const c = queue.shift();
            if (!c) return;
            try {
              const ch = await ftChannel(c.id);
              if (!ch) return;
              const thumb = ch.snippet.thumbnails.medium?.url;
              if (thumb) useChannels.getState().setThumb(c.id, thumb);
              const remoteTitle = ch.snippet.title;
              if (remoteTitle && titleLooksBroken(c.title, c.id) && !titleLooksBroken(remoteTitle, c.id)) {
                useChannels.getState().setTitle(c.id, remoteTitle);
              }
            } catch {
              /* 静默 */
            }
          }
        }),
      );
    },
  };
});

/** 刷新全部博主的远端元数据（头像/损坏标题），并发 4 拉取，失败静默。
 *  供分组看板、收藏页的刷新固钉调用（看板头像/订阅右栏即时更新） */
export async function refreshChannelsMeta(): Promise<void> {
  const channels = useChannels.getState().channels;
  const queue = [...channels];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (;;) {
        const c = queue.shift();
        if (!c) return;
        try {
          const ch = await ftChannel(c.id);
          if (!ch) continue;
          const thumb = ch.snippet.thumbnails.medium?.url;
          if (thumb) useChannels.getState().setThumb(c.id, thumb);
          const remoteTitle = ch.snippet.title;
          if (remoteTitle && titleLooksBroken(c.title, c.id) && !titleLooksBroken(remoteTitle, c.id)) {
            useChannels.getState().setTitle(c.id, remoteTitle);
          }
        } catch {
          /* 静默 */
        }
      }
    }),
  );
}
