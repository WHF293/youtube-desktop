import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ftSubscriptionsFeed, ftChannel } from "../lib/innertube";
import { errorMessage, type Status } from "./videos";
import { useChannels, titleLooksBroken } from "./channels";
import type { VideoItem } from "../types/youtube";

/** 触底分页批大小：RSS 逐频道聚合无 continuation token（服务端无法翻页），
 *  分页采用前端切片——items 一次拿全，触底时只扩大可见窗口（本地操作，无网络请求） */
export const SUBS_PAGE_SIZE = 30;

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
  /** 触底分页：当前可见条数（UI 按 items.slice(0, visible) 渲染） */
  visible: number;
  /** 是否还有未展示的条目（visible < items.length） */
  hasMore: boolean;
  /** 分组筛选：勾选的分组 key（"ungrouped" = 默认分组 / 分组 id）；null = 全部勾选 */
  selectedGroups: string[] | null;
  setSelectedGroups: (keys: string[] | null) => void;
  load: () => Promise<void>;
  /** 触底加载下一批（本地切片扩窗，不发起网络请求，天然无重复请求） */
  loadMore: () => void;
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
        visible: SUBS_PAGE_SIZE,
        hasMore: false,
        selectedGroups: null,
        setSelectedGroups: (selectedGroups) => set({ selectedGroups }),
        loadMore: () => {
          // 本地切片扩窗：同步操作无 loading 周期；已到全长时不再触发任何状态更新
          const { visible, items } = get();
          if (visible >= items.length) return;
          const next = Math.min(visible + SUBS_PAGE_SIZE, items.length);
          set({ visible: next, hasMore: next < items.length });
        },
        load: async () => {
          const id = ++seq;
          const channels = useChannels.getState().channels;
          if (channels.length === 0) {
            set({ items: [], failed: [], status: "ready", error: "", visible: SUBS_PAGE_SIZE, hasMore: false });
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
            set({ items: [], failed: [], status: "ready", error: "", visible: SUBS_PAGE_SIZE, hasMore: false });
            return;
          }
          set({ status: "loading", error: "" });
          try {
            const { videos, failedIds } = await ftSubscriptionsFeed(target.map((c) => c.id));
            if (id !== seq) return;
            const titleOf = (cid: string) => target.find((c) => c.id === cid)?.title ?? cid;
            // 每次整页重拉（刷新 / 切分组）都重置分页游标：可见窗口回到第一批
            set({
              items: videos,
              failed: failedIds.map(titleOf),
              status: "ready",
              error: "",
              visible: SUBS_PAGE_SIZE,
              hasMore: videos.length > SUBS_PAGE_SIZE,
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
