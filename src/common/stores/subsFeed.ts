import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ftSubscriptionsFeed, ftChannel } from "../lib/innertube";
import { errorMessage, type Status } from "./videos";
import { useChannels, titleLooksBroken } from "./channels";
import type { VideoItem } from "../types/youtube";

/** FreeTube 模式订阅流：本地频道列表的 RSS 聚合（无登录态）。
 *  加载顺带自愈本地坏数据：头像缺失 + 标题损坏（历史版本 CSV 导入错位的产物）
 *  用 ftChannel 的远端正确数据覆盖并持久化。
 *  支持分组筛选：只拉取勾选分组内博主的订阅信息（勾选态持久化，null = 全部） */
interface SubsFeedState {
  items: VideoItem[];
  /** 拉取失败（RSS 404 / 网络抖动）的频道标题 */
  failed: string[];
  status: Status;
  error: string;
  /** 分组筛选：勾选的分组 key（"ungrouped" = 默认分组 / 分组 id）；null = 全部勾选 */
  selectedGroups: string[] | null;
  setSelectedGroups: (keys: string[] | null) => void;
  load: () => Promise<void>;
}

export const useSubsFeed = create<SubsFeedState>()(
  persist(
    (set, get) => {
      let seq = 0;
      return {
        items: [],
        failed: [],
        status: "idle",
        error: "",
        selectedGroups: null,
        setSelectedGroups: (selectedGroups) => set({ selectedGroups }),
        load: async () => {
          const id = ++seq;
          const channels = useChannels.getState().channels;
          if (channels.length === 0) {
            set({ items: [], failed: [], status: "ready", error: "" });
            return;
          }
          // 分组筛选：null = 全部；否则只保留勾选分组（含默认分组 key "ungrouped"）内的博主
          const sel = get().selectedGroups;
          const selectedSet = sel ? new Set(sel) : null;
          const target =
            selectedSet === null
              ? channels
              : channels.filter((c) => selectedSet.has(c.groupId ?? "ungrouped"));
          if (target.length === 0) {
            set({ items: [], failed: [], status: "ready", error: "" });
            return;
          }
          set({ status: "loading", error: "" });
          try {
            const { videos, failedIds } = await ftSubscriptionsFeed(target.map((c) => c.id));
            if (id !== seq) return;
            const titleOf = (cid: string) => target.find((c) => c.id === cid)?.title ?? cid;
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
          // 对头像缺失或标题损坏的频道，用 ftChannel 的远端数据覆盖并持久化（不筛选，全部自愈）。
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
    },
    {
      name: "yt-desktop-subsfeed",
      // 只持久化筛选勾选态（items 等运行时数据不落盘）
      partialize: (s) => ({ selectedGroups: s.selectedGroups }),
    },
  ),
);

/** 刷新全部博主的远端元数据（头像/损坏标题），并发 4 拉取，失败静默。
 *  供应用启动自愈、分组看板/收藏页的刷新固钉调用（看板头像/订阅右栏即时更新） */
let metaRefreshing = false;
export async function refreshChannelsMeta(): Promise<void> {
  if (metaRefreshing) return;
  metaRefreshing = true;
  try {
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
  } finally {
    metaRefreshing = false;
  }
}
