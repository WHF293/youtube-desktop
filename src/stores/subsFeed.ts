import { create } from "zustand";
import { ftSubscriptionsFeed, ftChannel } from "../lib/innertube";
import { errorMessage, type Status } from "./videos";
import { useChannels } from "./channels";
import type { VideoItem } from "../types/youtube";

/** FreeTube 模式订阅流：本地频道列表的 RSS 聚合（无登录态）。
 *  加载顺带懒补缺失的频道头像（存入 channels store 持久化，订阅页右栏展示用） */
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
      // 头像懒补：不阻塞视频流展示，失败静默（下次进页面再试）
      const pending = useChannels.getState().channels.filter((c) => !c.thumb);
      const queue = [...pending];
      void Promise.all(
        Array.from({ length: Math.min(4, queue.length) }, async () => {
          for (;;) {
            const c = queue.shift();
            if (!c) return;
            try {
              const thumb = (await ftChannel(c.id))?.snippet.thumbnails.medium?.url;
              if (thumb) useChannels.getState().setThumb(c.id, thumb);
            } catch {
              /* 静默 */
            }
          }
        }),
      );
    },
  };
});
