import Icon from "../../common/components/Icon";

/** 底部四主 Tab（历史 2026-10-28 移入「我的」页；与 .m-tabbar 的 /4 同步） */
const TABS = [
  { to: "/", label: "首页", icon: "home" },
  { to: "/subscriptions", label: "订阅", icon: "subscriptions" },
  { to: "/watchlater", label: "待看", icon: "watchLater" },
  { to: "/me", label: "我的", icon: "settings" },
] as const;

export interface GlassTabBarProps {
  /** 当前激活的 Tab 路由（精确匹配 TABS 的 to） */
  active: string;
  /** 「我的」角标：离线下载队列进行中数量（>0 显示） */
  badge?: number;
  onSelect: (to: string) => void;
}

/** 底部 TabBar：iOS 柔光玻璃悬浮胶囊 + 滑动指示气泡（.m-tabbar / .m-tabbar__thumb，参数对齐 whf-stock-board） */
export default function GlassTabBar({ active, badge = 0, onSelect }: GlassTabBarProps) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.to === active),
  );
  return (
    <nav className="m-tabbar">
      <span
        className="m-tabbar__thumb"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {TABS.map((tab) => (
        <button
          key={tab.to}
          type="button"
          className={`m-tabbar__item${tab.to === active ? " active" : ""}`}
          onClick={() => onSelect(tab.to)}
        >
          {tab.to === "/me" && badge > 0 && <span className="m-tabbar__badge">{badge}</span>}
          <span className="m-tabbar__icon">
            <Icon name={tab.icon} size={20} />
          </span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
