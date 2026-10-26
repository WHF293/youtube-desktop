import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 默认本地代理（国内直连 googleapis 不可达） */
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

/** 默认勾选：英语、汉语、日语（王总指定） */
export const DEFAULT_LANGS = ["en", "zh-CN", "ja"];

interface SettingsState {
  /** YouTube Data API v3 key */
  apiKey: string;
  /** OAuth access token（可选，用于「我的订阅」等只读功能） */
  accessToken: string;
  /** mostPopular 的地区码 */
  regionCode: string;
  /** 搜索内容语言偏好（多选，relevanceLanguage/hl 按语言注入） */
  languages: string[];
  /** API 请求代理（仅桌面端生效；留空则不走代理） */
  proxy: string;
  setApiKey: (key: string) => void;
  setAccessToken: (token: string) => void;
  setRegionCode: (code: string) => void;
  setLanguages: (langs: string[]) => void;
  setProxy: (proxy: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      accessToken: "",
      regionCode: "US",
      languages: DEFAULT_LANGS,
      proxy: DEFAULT_PROXY,
      setApiKey: (apiKey) => set({ apiKey }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setRegionCode: (regionCode) => set({ regionCode }),
      setLanguages: (languages) => set({ languages }),
      setProxy: (proxy) => set({ proxy }),
    }),
    { name: "yt-desktop-settings" },
  ),
);
