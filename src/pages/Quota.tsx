import Icon from "../components/Icon";
import { useQuota, usageToday, DAILY_QUOTA_LIMIT } from "../stores/quota";

const ENDPOINT_LABELS: Record<string, string> = {
  search: "搜索（search.list）",
  videos: "视频详情（videos.list）",
  channels: "频道（channels.list）",
  activities: "频道动态（activities.list）",
  playlists: "播放列表（playlists.list）",
  playlistItems: "播放列表条目（playlistItems.list）",
  commentThreads: "评论（commentThreads.list）",
  subscriptions: "订阅（subscriptions.list）",
};

/** 当日额度页：本地统计本应用发起的成功请求所消耗的配额单位 */
export default function Quota() {
  // 订阅 store，请求发生时页面实时刷新
  useQuota((s) => s.units);
  useQuota((s) => s.date);
  useQuota((s) => s.requests);
  useQuota((s) => s.byEndpoint);
  const { units, requests, byEndpoint } = usageToday();

  const percent = Math.min(100, (units / DAILY_QUOTA_LIMIT) * 100);
  const remaining = Math.max(0, DAILY_QUOTA_LIMIT - units);
  const details = Object.entries(byEndpoint).sort((a, b) => b[1].units - a[1].units);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-ink">今日额度</h1>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-end justify-between">
          <p className="text-3xl font-semibold tabular-nums text-ink">
            {units}
            <span className="text-base font-normal text-ink-3"> / {DAILY_QUOTA_LIMIT}</span>
          </p>
          <p className="text-xs text-ink-3">
            剩余 {remaining} 单位 · 成功请求 {requests} 次
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-flat">
          <div
            className={`h-full rounded-full transition-all ${
              percent >= 90 ? "bg-accent" : "bg-green-600 dark:bg-green-500"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 flex items-start gap-1 text-xs leading-5 text-ink-3">
          <Icon name="error" size={14} className="mt-0.5 shrink-0" />
          YouTube Data API v3 免费配额为每项目每天 10,000 单位，在太平洋时间午夜重置
          （北京时间次日 15:00/16:00，视夏令时而定）。此处为本应用的本地计数，仅统计
          本机发起的成功请求；若同一个 API Key 还在其他地方使用，以 Google Cloud
          Console 的配额页为准。
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">当日明细</h2>
        {details.length === 0 ? (
          <p className="mt-2 text-sm text-ink-2">今天还没有发起请求。</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="py-1.5 font-normal">接口</th>
                <th className="py-1.5 text-right font-normal">次数</th>
                <th className="py-1.5 text-right font-normal">消耗单位</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {details.map(([name, stat]) => (
                <tr key={name} className="border-t border-line">
                  <td className="py-1.5 text-ink">{ENDPOINT_LABELS[name] ?? name}</td>
                  <td className="py-1.5 text-right text-ink-2">{stat.count}</td>
                  <td className="py-1.5 text-right text-ink">{stat.units}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-medium text-ink">
                <td className="py-1.5">合计</td>
                <td className="py-1.5 text-right">{requests}</td>
                <td className="py-1.5 text-right">{units}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs leading-5 text-ink-3">
          计费口径：搜索 search.list 每次 100 单位（多语言偏好下每种语言各计一次），
          其余端点每次 1 单位。失败的请求不计入。
        </p>
      </section>
    </div>
  );
}
