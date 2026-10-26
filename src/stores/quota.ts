import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * YouTube Data API v3 免费配额：默认每项目每天 10,000 单位，
 * 配额在太平洋时间午夜重置。本地按「北京时间自然日」近似计日。
 * 计费口径（Data API v3）：search.list = 100 单位/次，其余端点 = 1 单位/次。
 */
export const DAILY_QUOTA_LIMIT = 10000;

export const QUOTA_COST: Record<string, number> = {
  search: 100,
  // videos / channels / playlists / playlistItems / commentThreads /
  // subscriptions / activities 均 1 单位
};

export function endpointCost(endpoint: string): number {
  return QUOTA_COST[endpoint] ?? 1;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface EndpointStat {
  count: number;
  units: number;
}

interface QuotaState {
  /** 计数所属日期（YYYY-MM-DD，本地时区）；跨天自动清零 */
  date: string;
  /** 当日已消耗配额单位 */
  units: number;
  /** 当日成功请求数 */
  requests: number;
  /** 按端点聚合的当日明细 */
  byEndpoint: Record<string, EndpointStat>;
  /** 每次成功请求后调用（endpoint 为纯端点名，如 search / videos） */
  record: (endpoint: string, units: number) => void;
  /** 手动清零（仅调试用） */
  reset: () => void;
}

export const useQuota = create<QuotaState>()(
  persist(
    (set, get) => ({
      date: today(),
      units: 0,
      requests: 0,
      byEndpoint: {},
      record: (endpoint, units) => {
        const t = today();
        const s = get();
        // 跨天：重置当日计数
        if (s.date !== t) {
          set({
            date: t,
            units,
            requests: 1,
            byEndpoint: { [endpoint]: { count: 1, units } },
          });
          return;
        }
        const prev = s.byEndpoint[endpoint] ?? { count: 0, units: 0 };
        set({
          units: s.units + units,
          requests: s.requests + 1,
          byEndpoint: {
            ...s.byEndpoint,
            [endpoint]: { count: prev.count + 1, units: prev.units + units },
          },
        });
      },
      reset: () => set({ date: today(), units: 0, requests: 0, byEndpoint: {} }),
    }),
    { name: "yt-desktop-quota" },
  ),
);

/** 规范化后的当日用量（存储里的日期不是今天则视为 0） */
export function usageToday(): { units: number; requests: number; byEndpoint: Record<string, EndpointStat> } {
  const s = useQuota.getState();
  if (s.date !== today()) return { units: 0, requests: 0, byEndpoint: {} };
  return { units: s.units, requests: s.requests, byEndpoint: s.byEndpoint };
}
