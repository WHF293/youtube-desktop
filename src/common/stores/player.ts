import { create } from "zustand";
import { ytApi } from "../lib/youtube";
import { errorMessage, type Status } from "./videos";
import type { ChannelItem, CommentThreadItem, VideoItem } from "../types/youtube";

interface PlayerState {
  videoId: string | null;
  video?: VideoItem;
  channel?: ChannelItem;
  comments: CommentThreadItem[];
  related: VideoItem[];
  status: Status;
  commentsStatus: Status;
  relatedStatus: Status;
  error: string;
  load: (videoId: string) => Promise<void>;
}

export const usePlayer = create<PlayerState>()((set) => {
  let seq = 0;
  return {
    videoId: null,
    video: undefined,
    channel: undefined,
    comments: [],
    related: [],
    status: "idle",
    commentsStatus: "idle",
    relatedStatus: "idle",
    error: "",
    load: async (videoId: string) => {
      const id = ++seq;
      set({
        videoId,
        video: undefined,
        channel: undefined,
        comments: [],
        related: [],
        status: "loading",
        commentsStatus: "loading",
        relatedStatus: "loading",
        error: "",
      });
      try {
        const video = await ytApi.videoDetail(videoId);
        if (id !== seq) return;
        set({ video, status: video ? "ready" : "error", error: video ? "" : "视频不存在或已被删除" });
        if (!video) return;

        // 详情就绪后并行拉：频道信息 / 评论 / 相关视频（按标题关键词搜索）
        ytApi.channel(video.snippet.channelId)
          .then((channel) => { if (id === seq) set({ channel }); })
          .catch(() => { /* 频道信息失败不阻塞主流程 */ });

        ytApi.commentThreads(videoId, 20)
          .then((comments) => { if (id === seq) set({ comments, commentsStatus: "ready" }); })
          .catch((e) => { if (id === seq) set({ commentsStatus: "error", error: errorMessage(e) }); });

        const q = video.snippet.title.slice(0, 60);
        ytApi.searchVideos(q, 15)
          .then((items) => { if (id === seq) set({ related: items.filter((v) => videoIdOf(v) !== videoId), relatedStatus: "ready" }); })
          .catch((e) => { if (id === seq) set({ relatedStatus: "error", error: errorMessage(e) }); });
      } catch (e) {
        if (id !== seq) return;
        set({ status: "error", error: errorMessage(e) });
      }
    },
  };
});

function videoIdOf(v: VideoItem): string {
  return typeof v.id === "string" ? v.id : (v.id.videoId ?? "");
}
