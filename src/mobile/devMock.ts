import { useVideos } from "../common/stores/videos";
import { usePlayer } from "../common/stores/player";
import { useTheme } from "../common/stores/theme";
import type { ChannelItem, VideoItem } from "../common/types/youtube";

/**
 * dev-only mock（pnpm dev:mobile + ?mock=1 时启用）：浏览器里 InnerTube 无 CORS
 * 无法直连，而大屏适配的截图比对（UI 稿 A0–A3）需要真实内容版式。
 * 注入静态首页/观看页数据并拦截 load 动作；import.meta.env.DEV 保证生产构建整树剔除。
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

export function installDevMock() {
  // 截图统一暗色稿（与 UI 稿暗色壳对齐）
  document.documentElement.classList.add("dark");
  useTheme.setState({ theme: "dark" });

  useVideos.setState({
    mode: "popular",
    items: MOCK_FEED,
    status: "ready",
    error: "",
    nextPageToken: null,
    loadingMore: false,
    loadPopular: async () => {
      useVideos.setState({ status: "ready", items: MOCK_FEED, error: "", nextPageToken: null });
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
        comments: [],
        error: "",
      });
    },
  });
}
