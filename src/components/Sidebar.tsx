import { NavLink } from "react-router-dom";
import { useState } from "react";
import Icon from "./Icon";
import { useUi } from "../stores/ui";
import { useQuota, usageToday, DAILY_QUOTA_LIMIT } from "../stores/quota";
import { useSettings } from "../stores/settings";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: "home", end: true },
  { to: "/trending", label: "热门", icon: "trending", end: false },
  { to: "/subscriptions", label: "我的订阅", icon: "subscriptions", end: false },
];

/** 侧栏底部固定入口（贴底） */
const BOTTOM_ITEMS = [
  { to: "/quota", label: "今日额度", icon: "gauge", extra: "quota" },
  { to: "/settings", label: "设置", icon: "settings", extra: "settings" },
];

/** 收起态 hover 气泡（fixed 定位，不受侧栏 overflow 裁剪） */
function RailTip({ text, x, y }: { text: string; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none fixed z-50 -translate-y-1/2 rounded-md bg-[#616161] px-2 py-1 text-xs text-white shadow-md dark:bg-[#3f3f3f]"
      style={{ left: x + 10, top: y }}
    >
      {text}
    </div>
  );
}

export default function Sidebar() {
  const open = useUi((s) => s.sidebarOpen);
  const collapsed = !open;
  // 订阅当日用量（每次请求后 store 更新，侧栏数字实时变化）
  useQuota((s) => s.units);
  useQuota((s) => s.date);
  const { units } = usageToday();
  const hasApiKey = useSettings((s) => s.apiKey.length > 0);

  // 收起态 hover 气泡
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center rounded-lg text-sm ${
      isActive ? "bg-flat font-medium text-accent" : "text-ink-2 hover:bg-flat hover:text-ink"
    } ${collapsed ? "h-10 justify-center" : "gap-4 px-3 py-2.5"}`;

  const tipHandlers = (text: string) =>
    collapsed
      ? {
          onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setTip({ text, x: r.right, y: r.top + r.height / 2 });
          },
          onMouseLeave: () => setTip(null),
        }
      : {};

  const quotaSuffix = collapsed ? null : (
    <span className="ml-auto text-xs tabular-nums text-ink-3">
      {units}/{DAILY_QUOTA_LIMIT}
    </span>
  );

  const settingsDot =
    collapsed && !hasApiKey ? (
      <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-accent" aria-label="未配置 API Key" />
    ) : !hasApiKey ? (
      <span className="ml-auto h-2 w-2 rounded-full bg-accent" aria-label="未配置 API Key" />
    ) : null;

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-island transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* 主导航 */}
      <nav className="flex-1 overflow-x-clip overflow-y-auto px-2 py-2">
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end} className={linkCls} {...tipHandlers(item.label)}>
                <Icon name={item.icon} size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* 底部固定入口 */}
      <div className="shrink-0 px-2 pb-2">
        <hr className="my-2 border-line" />
        <ul className="space-y-1">
          {BOTTOM_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={linkCls} {...tipHandlers(item.label)}>
                <Icon name={item.icon} size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {item.extra === "quota" && quotaSuffix}
                {item.extra === "settings" && settingsDot}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {tip && <RailTip text={tip.text} x={tip.x} y={tip.y} />}
    </aside>
  );
}
