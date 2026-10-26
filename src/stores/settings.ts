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

/** 默认勾选：汉语（王总指定 2026-10-26） */
export const DEFAULT_LANGS = ["zh-CN"];

interface SettingsState {
  /** YouTube Data API v3 key */
  apiKey: string;
  /** OAuth access token（短期，约 1 小时过期；配置了 refreshToken 会自动续期） */
  accessToken: string;
  /** OAuth refresh token（长期有效，用于自动换新 access token） */
  refreshToken: string;
  /** OAuth 客户端 ID（Playground / 自建 OAuth client） */
  oauthClientId: string;
  /** OAuth 客户端密钥 */
  oauthClientSecret: string;
  /** mostPopular 的地区码 */
  regionCode: string;
  /** 搜索内容语言偏好（多选，relevanceLanguage/hl 按语言注入） */
  languages: string[];
  /** API 请求代理（仅桌面端生效；留空则不走代理） */
  proxy: string;
  setApiKey: (key: string) => void;
  setAccessToken: (token: string) => void;
  setRefreshToken: (token: string) => void;
  setOauthClientId: (id: string) => void;
  setOauthClientSecret: (secret: string) => void;
  setRegionCode: (code: string) => void;
  setLanguages: (langs: string[]) => void;
  setProxy: (proxy: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: "",
      accessToken: "",
      refreshToken: "",
      oauthClientId: "",
      oauthClientSecret: "",
      regionCode: "US",
      languages: DEFAULT_LANGS,
      proxy: DEFAULT_PROXY,
      setApiKey: (apiKey) => set({ apiKey }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      setOauthClientId: (oauthClientId) => set({ oauthClientId }),
      setOauthClientSecret: (oauthClientSecret) => set({ oauthClientSecret }),
      setRegionCode: (regionCode) => set({ regionCode }),
      setLanguages: (languages) => set({ languages }),
      setProxy: (proxy) => set({ proxy }),
    }),
    {
      name: "yt-desktop-settings",
      // v0→v1：默认语言从「英/汉/日」改为只选「汉语」，老存储迁移一次
      version: 1,
      migrate: (state, version) =>
        version < 1 ? { ...(state as object), languages: DEFAULT_LANGS } : (state as object),
    },
  ),
);
