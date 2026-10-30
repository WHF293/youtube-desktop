import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 数据模式：官方 YouTube Data API 已下线（2026-10-26，凭证配置已移除），
 * 固定走 FreeTube 模式（InnerTube/RSS，无配额）。
 * mode 字段保留是为下线过渡期代码路径（lib/youtube.ts 官方分支）仍可编译。
 */
export type DataMode = "freeTube";

/** 默认本地代理（国内直连 youtube 不可达） */
export const DEFAULT_PROXY = "127.0.0.1:7897";

/** 内容语言候选（BCP-47，hl 与 relevanceLanguage 共用此值） */
export const CONTENT_LANGS = [
  ["en", "英语"],
  ["zh-CN", "汉语"],
  ["ja", "日语"],
  ["ko", "韩语"],
  ["fr", "法语"],
  ["de", "德语"],
  ["es", "西班牙语"],
  ["ru", "俄语"],
] as const;

/** 默认勾选：汉语（王总指定 2026-10-26） */
export const DEFAULT_LANGS = ["zh-CN"];

/** 地区候选（InnerTube context.gl；推荐页/分类页页内地区设置共用此清单）。
 *  不含 CN：实测 YouTube 搜索端点对 gl=CN 返回空结果（2026-10-26）。
 *  顺序按热点/知名度排列 */
export const REGIONS = [
  ["US", "美国"],
  ["GB", "英国"],
  ["JP", "日本"],
  ["KR", "韩国"],
  ["IN", "印度"],
  ["DE", "德国"],
  ["FR", "法国"],
  ["RU", "俄罗斯"],
  ["BR", "巴西"],
  ["CA", "加拿大"],
  ["AU", "澳大利亚"],
  ["MX", "墨西哥"],
  ["ES", "西班牙"],
  ["IT", "意大利"],
  ["ID", "印度尼西亚"],
  ["TH", "泰国"],
  ["VN", "越南"],
  ["NL", "荷兰"],
  ["SE", "瑞典"],
  ["HK", "中国香港"],
  ["TW", "中国台湾"],
  ["SG", "新加坡"],
] as const;

/** 视频下载默认目录（需求指定） */
export const DEFAULT_DOWNLOAD_DIR = "C:/download/youtube";

/** 下载默认清晰度候选 */
export const DOWNLOAD_QUALITIES = [
  ["auto", "自动（最高）"],
  ["1080p", "1080p"],
  ["720p", "720p"],
  ["480p", "480p"],
  ["360p", "360p"],
] as const;

export type DownloadQuality = (typeof DOWNLOAD_QUALITIES)[number][0];

interface SettingsState {
  /** 数据模式（固定 freeTube） */
  mode: DataMode;
  /** 分类地区：分类页（新闻分类 search 地区化）与搜索结果的 InnerTube gl 地区偏好 */
  regionCode: string;
  /** 推荐地区：首页「推荐」地区频道组（FT_REGION_GROUPS）专用，与分类地区独立设置 */
  popularRegionCode: string;
  /** 搜索内容语言偏好（单选，InnerTube context.hl；历史多选数据取第一个） */
  languages: string[];
  /** API 请求代理（PC/Android 通用，经 Rust reqwest 即时生效；留空则不走代理） */
  proxy: string;
  /** 视频下载目录（离线视频保存位置） */
  downloadDir: string;
  /** 下载默认清晰度（弹窗预选档位） */
  defaultQuality: DownloadQuality;
  /** ffmpeg 路径覆盖（留空 = 首次使用时自动下载到应用数据目录） */
  ffmpegPath: string;
  setRegionCode: (code: string) => void;
  setPopularRegionCode: (code: string) => void;
  setLanguages: (langs: string[]) => void;
  setProxy: (proxy: string) => void;
  setDownloadDir: (dir: string) => void;
  setDefaultQuality: (q: DownloadQuality) => void;
  setFfmpegPath: (p: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      mode: "freeTube",
      regionCode: "US",
      popularRegionCode: "US",
      languages: DEFAULT_LANGS,
      proxy: DEFAULT_PROXY,
      downloadDir: DEFAULT_DOWNLOAD_DIR,
      defaultQuality: "auto",
      ffmpegPath: "",
      setRegionCode: (regionCode) => set({ regionCode }),
      setPopularRegionCode: (popularRegionCode) => set({ popularRegionCode }),
      setLanguages: (languages) => set({ languages }),
      setProxy: (proxy) => set({ proxy }),
      setDownloadDir: (downloadDir) => set({ downloadDir }),
      setDefaultQuality: (defaultQuality) => set({ defaultQuality }),
      setFfmpegPath: (ffmpegPath) => set({ ffmpegPath }),
    }),
    {
      name: "yt-desktop-settings",
      // v2：官方 API 下线，移除凭证字段并强制 FreeTube 模式
      // v3：地区候选移除 CN（gl=CN 搜索返回空），已存的 CN 迁移为 US
      // v4：新增视频下载配置（downloadDir/defaultQuality/ffmpegPath）
      // v5：地区拆分（推荐地区/分类地区独立设置），popularRegionCode 继承原 regionCode
      version: 5,
      migrate: (state, version) => {
        let s = state as Record<string, unknown>;
        if (version < 2) {
          const { mode: _m, apiKey: _k, accessToken: _t, refreshToken: _r, oauthClientId: _c, oauthClientSecret: _s, ...rest } = s;
          void _m; void _k; void _t; void _c; void _r; void _s;
          s = { ...rest, mode: "freeTube" };
        }
        if (version < 3 && s.regionCode === "CN") s = { ...s, regionCode: "US" };
        if (version < 5) s = { ...s, popularRegionCode: s.regionCode ?? "US" };
        return s;
      },
    },
  ),
);
