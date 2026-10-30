import { useVideos } from "../common/stores/videos";
import { usePlayer } from "../common/stores/player";
import { useTheme } from "../common/stores/theme";
import { useSubsFeed } from "../common/stores/subsFeed";
import { useChannels, type SubChannel, type ChannelGroup } from "../common/stores/channels";
import { useHistory, type HistoryEntry } from "../common/stores/history";
import { useWatchLater, type WatchLaterEntry } from "../common/stores/watchLater";
import { useFavorites, type FavVideo, type FavGroup } from "../common/stores/favorites";
import { useDownloads, type DlTask } from "../common/stores/downloads";
import { ytApi } from "../common/lib/youtube";
import { videoIdOf } from "../common/lib/format";
import type { ChannelItem, VideoItem, CommentThreadItem, PlaylistItem } from "../common/types/youtube";
import type { ManifestEntry } from "../common/types/offline";

/**
 * dev-only mock（pnpm dev:mobile + ?mock=1 时启用）：浏览器里 InnerTube 无 CORS、
 * Tauri invoke 不可用，界面验收（UI 稿比对 / 移动端走查）需要真实内容版式。
 *
 * 覆盖范围：
 * - 数据 store：首页 feed / 观看页（含评论）/ 订阅流 + 博主分组 / 收藏 / 待看 /
 *   观看记录 / 下载任务，全部铺静态数据并拦截 load 动作；
 * - ytApi.searchVideosPage：搜索页结果（标题带关键词回显，第二页走 mock token）；
 * - Tauri IPC shim：注入 window.__TAURI_INTERNALS__ 白名单命令，只服务浏览器里
 *   直接 invoke 的调用（离线清单读取/删除、版本号）。注意不设 globalThis.isTauri，
 *   isTauri() 保持 false——图片走 data URI 直连、Tauri effect 全部跳过，副作用最小。
 *
 * 明暗模式：默认强制暗色（与 UI 稿壳对齐）；?mock=light 跳过强制，按 localStorage 走。
 * import.meta.env.DEV 保证生产构建整树剔除。
 */

const CHANNELS = [
  "硬核数码实验室",
  "前端手艺人",
  "系统研究所",
  "测评组",
  "Rust 夜谈",
  "UI 研究室",
] as const;

const FEED: Array<[string, string, string, string]> = [
  // [标题, 频道, 时长 ISO, 观看数]
  ["小米澎湃OS 自由窗口全解析：小窗 / 迷你小窗一文学会", CHANNELS[0], "PT23M14S", "120000"],
  ["折叠屏大屏适配实战：断点布局与 NavigationRail", CHANNELS[1], "PT18M42S", "86000"],
  ["2026 澎湃OS 系统级多任务体验报告", CHANNELS[2], "PT15M03S", "210000"],
  ["平板端 YouTube 客户端横评：谁能用好 840dp？", CHANNELS[3], "PT21M37S", "64000"],
  ["Tauri 2.0 Android 打包踩坑全记录", CHANNELS[4], "PT27M05S", "43000"],
  ["玻璃拟态 UI 从 0 到 1：磨砂、高光与折射", CHANNELS[5], "PT12M48S", "98000"],
  ["Android 多窗口生命周期深度剖析", CHANNELS[2], "PT19M56S", "72000"],
  ["迷你小窗挂机看直播的正确姿势", CHANNELS[0], "PT8M23S", "156000"],
  ["H.265 与 AV1：移动端硬解现状", CHANNELS[3], "PT16M9S", "39000"],
  ["从 WebView2 到 Android WebView：一套代码两端跑", CHANNELS[1], "PT24M31S", "51000"],
  ["桌面端 Tauri 自更新全流程实测", CHANNELS[4], "PT11M12S", "28000"],
  ["订阅分组管理的设计取舍", CHANNELS[5], "PT9M47S", "18000"],
];

const COMMENTS: Array<[string, string]> = [
  ["数码老张", "讲得比官方文档清楚多了，自由窗口那段直接抄作业。"],
  ["前端手艺人", "840dp 断点这块深有同感，rail 和 tabbar 切换的阈值值得单独一期。"],
  ["深夜修Bug", "看到 mux 那段想起我上周编译 ffmpeg 的一晚上，泪目。"],
  ["画质党", "求测一下 AV1 在骁龙 7 系的硬解功耗，网上数据太少了。"],
  ["系统部阿伟", "已三连，折叠屏适配这篇转给团队全员观看了。"],
  ["储能观察员", "背景音乐好评，求歌名！"],
];

/** 内联 SVG 渐变缩略图（data URI）：浏览器环境无图片代理，外网图床不可靠 */
function thumbSvg(seed: number): string {
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 28% 26%)"/>
      <stop offset="0.6" stop-color="hsl(${(hue + 40) % 360} 22% 16%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 80) % 360} 20% 12%)"/>
    </linearGradient></defs>
    <rect width="480" height="270" fill="url(#g)"/>
    <circle cx="330" cy="96" r="60" fill="hsl(${hue} 30% 40% / 0.35)"/>
    <path d="M225 118v34l30-17z" fill="rgb(255 255 255 / 0.55)"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 频道头像（渐变圆 + 首字） */
function avatarSvg(seed: number, name: string): string {
  const hue = (seed * 97 + 30) % 360;
  const ch = name.slice(0, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
    <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue} 45% 42%)"/>
      <stop offset="1" stop-color="hsl(${(hue + 50) % 360} 40% 28%)"/>
    </linearGradient></defs>
    <rect width="96" height="96" fill="url(#a)"/>
    <text x="48" y="62" font-size="40" font-family="sans-serif" font-weight="700"
      fill="#fff" text-anchor="middle">${ch}</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function thumb(seed: number): { medium: { url: string } } {
  return { medium: { url: thumbSvg(seed) } };
}

function mockVideo(i: number, id?: string): VideoItem {
  const [title, channelTitle, duration, viewCount] = FEED[i % FEED.length];
  return {
    kind: "youtube#video",
    etag: `mock-${i}`,
    id: id ?? `mockVideo${i}`,
    snippet: {
      publishedAt: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      channelId: `mockCh${i % CHANNELS.length}`,
      channelTitle,
      title,
      description: "",
      thumbnails: thumb(i),
    },
    statistics: { viewCount },
    contentDetails: { duration },
  };
}

const MOCK_FEED = FEED.map((_, i) => mockVideo(i));

const MOCK_CHANNEL: ChannelItem = {
  id: "mockCh0",
  snippet: {
    title: CHANNELS[0],
    description: "",
    publishedAt: "2019-06-01T00:00:00Z",
    thumbnails: { medium: { url: thumbSvg(90) } },
  },
  statistics: { subscriberCount: "324000" },
};

function mockComments(videoId: string): CommentThreadItem[] {
  const now = Date.now();
  return COMMENTS.map(([author, text], i) => ({
    id: `mockCmt${i}`,
    snippet: {
      channelId: "mockCh0",
      videoId,
      topLevelComment: {
        id: `mockCmt${i}`,
        snippet: {
          textDisplay: text,
          textOriginal: text,
          authorDisplayName: author,
          authorProfileImageUrl: avatarSvg(i, author),
          likeCount: 128 - i * 17,
          publishedAt: new Date(now - (i + 1) * 3600_000 * 5).toISOString(),
          updatedAt: new Date(now - (i + 1) * 3600_000 * 5).toISOString(),
        },
      },
      totalReplyCount: i % 3,
    },
  }));
}

/* ---------------------------------------------------------------- */
/* 各 store 种子数据                                                  */
/* ---------------------------------------------------------------- */

const MOCK_GROUPS: ChannelGroup[] = [
  { id: "mockG1", name: "科技数码" },
  { id: "mockG2", name: "编程开发" },
];

const MOCK_CHANNELS: SubChannel[] = CHANNELS.map((title, i) => ({
  id: `mockCh${i}`,
  title,
  addedAt: new Date(Date.now() - (i + 3) * 86400000).toISOString(),
  thumb: avatarSvg(i, title),
  groupId: i < 2 ? "mockG1" : i < 4 ? "mockG2" : undefined,
}));

const MOCK_HISTORY: HistoryEntry[] = (() => {
  const now = Date.now();
  const hours = [2, 5, 9, 26, 30, 49, 55, 70];
  return hours.map((h, i) => {
    const v = MOCK_FEED[i % MOCK_FEED.length];
    return {
      videoId: videoIdOf(v) ?? `mockVideo${i}`,
      title: v.snippet.title,
      channelId: v.snippet.channelId,
      channelTitle: v.snippet.channelTitle,
      thumb: thumbSvg(i + 3),
      duration: v.contentDetails?.duration ?? "PT10M",
      watchedAt: now - h * 3600_000,
    };
  });
})();

const MOCK_WATCH_LATER: WatchLaterEntry[] = [0, 2, 4, 7, 9].map((i, k) => {
  const v = MOCK_FEED[i];
  return {
    videoId: videoIdOf(v) ?? `mockVideo${i}`,
    title: v.snippet.title,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    thumb: thumbSvg(i + 20),
    duration: v.contentDetails?.duration ?? "PT10M",
    addedAt: Date.now() - (k + 1) * 86400_000,
    status: (["todo", "half", "done", "todo", "half"] as const)[k],
  };
});

const MOCK_FAV_GROUPS: FavGroup[] = [
  { id: "mockFavG1", name: "教程收藏" },
  { id: "mockFavG2", name: "随时再看" },
];

const MOCK_FAVS: FavVideo[] = [1, 3, 5, 8].map((i, k) => {
  const v = MOCK_FEED[i];
  return {
    videoId: videoIdOf(v) ?? `mockVideo${i}`,
    title: v.snippet.title,
    channelId: v.snippet.channelId,
    channelTitle: v.snippet.channelTitle,
    thumb: thumbSvg(i + 40),
    addedAt: new Date(Date.now() - (k + 1) * 86400_000).toISOString(),
    groupId: k === 0 ? "mockFavG1" : k === 1 ? "mockFavG2" : undefined,
  };
});

const MOCK_DL_TASKS: DlTask[] = [
  {
    videoId: "mockVideo6",
    title: FEED[6][0],
    channelTitle: FEED[6][1],
    thumb: thumbSvg(6),
    duration: "PT19M56S",
    quality: "1080p",
    dir: "C:/mock/appdata/offline",
    status: "downloading",
    percent: 64,
    createdAt: Date.now() - 600_000,
  },
  {
    videoId: "mockVideo10",
    title: FEED[10][0],
    channelTitle: FEED[10][1],
    thumb: thumbSvg(10),
    duration: "PT11M12S",
    quality: "720p",
    dir: "C:/mock/appdata/offline",
    status: "queued",
    percent: 0,
    createdAt: Date.now() - 300_000,
  },
];

const MOCK_MANIFEST: ManifestEntry[] = [0, 3, 8].map((i, k) => ({
  videoId: `mockVideo${i}`,
  title: FEED[i][0],
  channelTitle: FEED[i][1],
  duration: FEED[i][2],
  quality: k === 0 ? "1080p 高码率" : k === 1 ? "720p" : "480p",
  filename: `${FEED[i][0].slice(0, 12)}.mp4`,
  thumb: thumbSvg(i + 60),
  thumbPath: `C:/mock/appdata/offline/thumb${i}.jpg`,
  size: (142 - k * 37) * 1024 * 1024,
  path: `C:/mock/appdata/offline/video${i}.mp4`,
  downloadedAt: Date.now() - (k + 1) * 86400_000,
}));

/* ---------------------------------------------------------------- */
/* Tauri IPC shim（仅浏览器预览；真实 Tauri 环境跳过）                 */
/* ---------------------------------------------------------------- */

/** 浏览器 mock 的离线清单（删除命令会同步摘除条目） */
const shimManifest = [...MOCK_MANIFEST];

interface MockInternals {
  metadata: { currentWindow: { label: string }; currentWebview: { label: string } };
  transformCallback: (cb: unknown, once?: boolean) => number;
  convertFileSrc: (path: string, protocol?: string) => string;
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

function installIpcShim() {
  // 真实 Tauri WebView 里不覆盖（保真优先）
  if ("__TAURI_INTERNALS__" in window) return;

  let cbSeq = 0;  const handlers: Record<string, (args?: Record<string, unknown>) => unknown> = {
    // 离线清单读取 / 删除（Offline / OfflineWatch 页）
    read_download_manifest: () => ({ videos: shimManifest }),
    delete_offline_video: (args) => {
      const videoId = args?.videoId as string | undefined;
      if (videoId) {
        const idx = shimManifest.findIndex((e) => e.videoId === videoId);
        if (idx >= 0) shimManifest.splice(idx, 1);
      }
      return null;
    },
    // 图片代理：data URI 直接回显（mock 缩略图全是内联 SVG）
    yt_image: (args) => args?.url as string,
    // 杂项：代理落盘 no-op / 应用数据目录 / 版本号
    save_webview_proxy: () => null,
    "plugin:path|app_data_dir": () => "C:/mock/appdata",
    "plugin:app|version": () => "0.7.0",
    // 事件监听（下载进度）：注册成功但永不派发
    "plugin:event|listen": () => ++cbSeq,
    "plugin:event|unlisten": () => null,
  };

  const internals: MockInternals = {
    metadata: { currentWindow: { label: "mock" }, currentWebview: { label: "mock" } },
    transformCallback: () => ++cbSeq,
    convertFileSrc: (path, protocol = "asset") => `${protocol}://localhost/${encodeURI(path)}`,
    invoke: (cmd, args) => {
      const h = handlers[cmd];
      if (h) return Promise.resolve(h(args));
      // 未覆盖的命令明确报错（保持失败可见，而不是静默挂起）
      return Promise.reject(new Error(`devMock: 命令 ${cmd} 未提供浏览器 mock`));
    },
  };
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = internals;
  // 事件插件运行时注入的全局（unlisten 用），兜底防 StrictMode 双挂载报错
  (window as unknown as Record<string, unknown>).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };
}

/* ---------------------------------------------------------------- */
/* 入口                                                              */
/* ---------------------------------------------------------------- */

export function installDevMock() {
  // IPC shim 最先装（服务 Offline/OfflineWatch 等页面的直连 invoke）
  installIpcShim();

  // 截图统一暗色稿（与 UI 稿暗色壳对齐）；?mock=light 跳过，验收明色界面
  if (!new URLSearchParams(window.location.search).has("light")) {
    document.documentElement.classList.add("dark");
    useTheme.setState({ theme: "dark" });
  }

  useVideos.setState({
    mode: "popular",
    items: MOCK_FEED,
    status: "ready",
    error: "",
    nextPageToken: null,
    loadingMore: false,
    loadPopular: async (categoryId?: string) => {
      // 与真实 store 对齐：同步 category（分类 chips 高亮 / 左右滑切换依赖它）
      useVideos.setState({ category: categoryId, status: "ready", items: MOCK_FEED, error: "", nextPageToken: null });
    },
    loadMorePopular: async () => {},
  });

  usePlayer.setState({
    status: "loading",
    comments: [],
    related: [],
    commentsStatus: "ready",
    load: async (videoId: string) => {
      usePlayer.setState({
        videoId,
        video: mockVideo(0, videoId),
        channel: MOCK_CHANNEL,
        related: MOCK_FEED.slice(1, 9),
        status: "ready",
        relatedStatus: "ready",
        commentsStatus: "ready",
        comments: mockComments(videoId),
        error: "",
      });
    },
  });

  // 订阅流 + 博主/分组（Subscriptions 页横滑岛、chips；Me 页订阅计数）
  useChannels.setState({ channels: MOCK_CHANNELS, groups: MOCK_GROUPS });
  useSubsFeed.setState({
    items: MOCK_FEED,
    failed: [],
    status: "ready",
    error: "",
    selectedGroups: null,
    load: async () => {
      useSubsFeed.setState({ status: "ready", error: "" });
    },
  });

  // 观看记录：浏览器无 SQLite，init/删改全部走内存
  useHistory.setState({
    entries: MOCK_HISTORY,
    status: "ready",
    error: "",
    init: async () => {
      useHistory.setState({ status: "ready", error: "" });
    },
    record: async () => {},
    remove: async (videoId) => {
      useHistory.setState((s) => ({ entries: s.entries.filter((e) => e.videoId !== videoId) }));
    },
    removeDay: async (watchedAt) => {
      const key = new Date(watchedAt).toDateString();
      useHistory.setState((s) => ({
        entries: s.entries.filter((e) => new Date(e.watchedAt).toDateString() !== key),
      }));
    },
  });

  // 待看 / 收藏（persist store，直接铺条目）
  useWatchLater.setState({ entries: MOCK_WATCH_LATER });
  useFavorites.setState({ videos: MOCK_FAVS, groups: MOCK_FAV_GROUPS });

  // 下载队列：下载中任务供 Offline 页进度条 / TabBar 角标展示；
  // pump/markInterrupted 置空，防止真实下载链路被意外触发
  useDownloads.setState({
    tasks: MOCK_DL_TASKS,
    pump: async () => {},
    markInterrupted: () => {},
  });

  // 搜索页：结果标题回显关键词，第二页走 mock token（触底分页可验收）
  (ytApi as unknown as {
    searchVideosPage: (
      q: string,
      max?: number,
      token?: string,
    ) => Promise<{ items: VideoItem[]; nextPageToken: string | null }>;
  }).searchVideosPage = async (q, _max, token) => {
    const start = token ? 4 : 0;
    const items = FEED.slice(start, start + 8).map((_, i) =>
      mockVideo(start + i, `mockSearch${token ?? "p1"}-${i}`),
    ).map((v) => ({
      ...v,
      snippet: { ...v.snippet, title: `${q} · ${v.snippet.title}` },
    }));
    return { items, nextPageToken: token ? null : "mockPage2" };
  };

  // 博主主页：频道详情 / 频道视频 / 播放列表（浏览器内无法拉 InnerTube）
  const mockChannel = (channelId: string): ChannelItem | undefined => {
    const m = /^mockCh(\d+)$/.exec(channelId);
    if (!m) return undefined;
    const i = Number(m[1]) % CHANNELS.length;
    return {
      id: channelId,
      snippet: {
        title: CHANNELS[i],
        description: `${CHANNELS[i]}，专注${
          ["数码测评", "前端技术", "系统底层", "硬件横评", "Rust 与系统编程", "界面设计"][i]
        }的原创频道，每周更新。`,
        customUrl: `@mockch${i}`,
        publishedAt: "2019-06-01T00:00:00Z",
        thumbnails: { medium: { url: avatarSvg(i, CHANNELS[i]) } },
      },
      statistics: {
        subscriberCount: String(324_000 - i * 47_000),
        videoCount: String(186 - i * 17),
      },
    };
  };
  const ytApiPatch = ytApi as unknown as {
    channel: (channelId: string) => Promise<ChannelItem | undefined>;
    channelVideos: (channelId: string, max?: number) => Promise<VideoItem[]>;
    channelPlaylists: (channelId: string, max?: number) => Promise<PlaylistItem[]>;
    playlistVideosPage: (
      playlistId: string,
      token?: string,
    ) => Promise<{ title: string; channelTitle: string; items: VideoItem[]; nextPageToken: string | null }>;
  };
  ytApiPatch.channel = async (channelId) => mockChannel(channelId);
  ytApiPatch.channelVideos = async (channelId) => {
    const m = /^mockCh(\d+)$/.exec(channelId);
    const chIdx = m ? Number(m[1]) % CHANNELS.length : 0;
    return FEED.map((_, k) => mockVideo(chIdx + k * 3, `mockChVid${chIdx}-${k}`)).map((v) => ({
      ...v,
      snippet: { ...v.snippet, channelId },
    }));
  };
  ytApiPatch.channelPlaylists = async (channelId) => {
    const m = /^mockCh(\d+)$/.exec(channelId);
    const i = m ? Number(m[1]) % CHANNELS.length : 0;
    return [0, 1, 2].map((k) => ({
      id: `mockPl${i}-${k}`,
      snippet: {
        title: `${CHANNELS[i]} · 系列合集 ${k + 1}`,
        description: "",
        publishedAt: new Date(Date.now() - (k + 1) * 30 * 86400_000).toISOString(),
        channelId,
        channelTitle: CHANNELS[i],
        thumbnails: { medium: { url: thumbSvg(i * 3 + k + 70) } },
        contentDetails: { itemCount: 14 - k * 4 },
      },
    }));
  };
  // 播放列表详情：mockPl<i>-<k> → 标题回显 + 第一页 8 条（token 翻第二页后到底）
  ytApiPatch.playlistVideosPage = async (playlistId, token) => {
    const m = /^mockPl(\d+)-(\d+)$/.exec(playlistId);
    const i = m ? Number(m[1]) % CHANNELS.length : 0;
    const k = m ? Number(m[2]) : 0;
    const start = token ? 8 : 0;
    return {
      title: `${CHANNELS[i]} · 系列合集 ${k + 1}`,
      channelTitle: CHANNELS[i],
      items: FEED.slice(start, start + 8).map((_, n) => mockVideo(i + n, `mockPlVid${playlistId}-${start + n}`)),
      nextPageToken: token ? null : "mockPlPage2",
    };
  };
}
