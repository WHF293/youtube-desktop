import { NavLink, useLocation } from "react-router-dom";
import { useRef, useState } from "react";
import Icon from "../../common/components/Icon";
import { useUi } from "../../common/stores/ui";
import { useSettings, REGIONS } from "../../common/stores/settings";
import { thumbPhaseCls, thumbStyle, useSlidingThumb } from "../../common/lib/useSlidingThumb";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: "home", end: true },
  { to: "/subscriptions", label: "订阅", icon: "subscriptions", end: false },
  { to: "/history", label: "历史", icon: "history", end: false },
  { to: "/watchlater", label: "待看", icon: "watchLater", end: false },
  { to: "/favorites", label: "收藏", icon: "star", end: false },
  { to: "/offline", label: "离线", icon: "download", end: false },
];

/** 侧栏底部固定入口（贴底） */
const BOTTOM_ITEMS = [{ to: "/settings", label: "设置", icon: "settings" }];

/** 侧栏地区入口的 hover 说明 */
const REGION_TIP = "切换首页「全部/新闻」的内容地区与搜索结果的地区倾向（InnerTube context.gl），选择即生效。";

/** 地区选择浮层（滑动玻璃气泡选中态；独立组件 = 每次打开重新量取气泡几何） */
function RegionMenu({
  regionCode,
  onPick,
}: {
  regionCode: string;
  onPick: (code: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const activeIndex = REGIONS.findIndex(([code]) => code === regionCode);
  const { rect, phase } = useSlidingThumb(ref, activeIndex);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="选择地区"
      className="relative overflow-y-auto rounded-xl py-1"
      style={{ maxHeight: "min(480px, calc(100vh - 24px))" }}
    >
      {rect && (
        <span
          aria-hidden
          className={`glass-btn glass-thumb pointer-events-none left-0 top-0 rounded-lg ${thumbPhaseCls(phase)}`}
          style={thumbStyle(rect, phase)}
        />
      )}
      {REGIONS.map(([code, label]) => (
        <button
          key={code}
          type="button"
          role="menuitemradio"
          data-thumb-item
          aria-checked={code === regionCode}
          onClick={() => onPick(code)}
          className={`relative flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-flat ${
            code === regionCode ? "font-medium text-accent" : "text-ink"
          }`}
        >
          <span>
            {label}（{code}）
          </span>
          {code === regionCode && <span className="text-xs">当前</span>}
        </button>
      ))}
    </div>
  );
}

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

/** 侧栏地区入口：hover 显示说明，点击弹出地区选择浮层，选择即生效 */
function RegionEntry({ collapsed }: { collapsed: boolean }) {
  const regionCode = useSettings((s) => s.regionCode);
  const setRegionCode = useSettings((s) => s.setRegionCode);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  const openMenu = (e: React.MouseEvent<HTMLElement>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // 浮层往右弹出，底部空间不足时上移（浮层最大 480px，超出内部滚动）
    setMenu({ x: r.right + 8, y: Math.max(12, Math.min(r.top - 8, window.innerHeight - 504)) });
  };

  const hoverTip = (e: React.MouseEvent<HTMLElement>) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ text: collapsed ? `地区 · ${regionCode}。${REGION_TIP}` : REGION_TIP, x: r.right, y: r.top + r.height / 2 });
  };

  const itemCls = `group relative flex w-full items-center rounded-lg text-sm text-ink-2 hover:bg-flat hover:text-ink ${
    collapsed ? "h-10 justify-center" : "gap-4 px-3 py-2.5"
  }`;

  return (
    <>
      <button
        type="button"
        onClick={openMenu}
        onMouseEnter={hoverTip}
        onMouseLeave={() => setTip(null)}
        aria-label={`地区，当前 ${regionCode}`}
        className={itemCls}
      >
        <Icon name="language" size={20} className="shrink-0" />
        {!collapsed && (
          <>
            <span className="truncate">地区</span>
            <span className="ml-auto text-xs tabular-nums text-ink-3">{regionCode}</span>
          </>
        )}
      </button>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden="true" />
          <div
            className="fixed z-50 w-44 rounded-xl border border-line bg-surface shadow-island"
            style={{ left: menu.x, top: menu.y }}
          >
            <RegionMenu
              regionCode={regionCode}
              onPick={(code) => {
                setRegionCode(code);
                setMenu(null);
              }}
            />
          </div>
        </>
      )}

      {tip && <RailTip text={tip.text} x={tip.x} y={tip.y} />}
    </>
  );
}

export default function Sidebar() {
  const open = useUi((s) => s.sidebarOpen);
  const collapsed = !open;
  const location = useLocation();

  // 收起态 hover 气泡
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);

  // 主导航滑动玻璃气泡：切换页面时气泡滑向当前项（travel 缩到 80% 变淡，restore 回弹恢复）
  const navRef = useRef<HTMLUListElement>(null);
  const activeIdx = NAV_ITEMS.findIndex((item) =>
    item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
  );
  const { rect: navRect, phase: navPhase } = useSlidingThumb(navRef, activeIdx, [collapsed]);

  // 主导航：选中态视觉由滑动气泡承担，这里只做文字着色
  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center rounded-lg text-sm ${
      isActive ? "font-medium text-accent" : "text-ink-2 hover:bg-flat hover:text-ink"
    } ${collapsed ? "h-10 justify-center" : "gap-4 px-3 py-2.5"}`;

  // 底部固定入口（设置）：静态玻璃选中态
  const bottomLinkCls = ({ isActive }: { isActive: boolean }) =>
    `group relative flex items-center rounded-lg text-sm ${
      isActive ? "glass-btn font-medium text-accent" : "text-ink-2 hover:bg-flat hover:text-ink"
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

  return (
    <aside
      className={`flex shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-island transition-all duration-200 ${
        collapsed ? "w-16" : "w-56"
      }`}
    >
      {/* 主导航（滑动玻璃气泡选中态） */}
      <nav className="flex-1 overflow-x-clip overflow-y-auto px-2 py-2">
        <ul ref={navRef} className="relative space-y-1">
          {navRect && (
            <span
              aria-hidden
              className={`glass-btn glass-thumb pointer-events-none left-0 rounded-lg ${thumbPhaseCls(navPhase)}`}
              style={thumbStyle(navRect, navPhase)}
            />
          )}
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                data-thumb-item
                className={navLinkCls}
                {...tipHandlers(item.label)}
              >
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
        <div className="mb-1">
          <RegionEntry collapsed={collapsed} />
        </div>
        <ul className="space-y-1">
          {BOTTOM_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} className={bottomLinkCls} {...tipHandlers(item.label)}>
                <Icon name={item.icon} size={20} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
      </div>

      {tip && <RailTip text={tip.text} x={tip.x} y={tip.y} />}
    </aside>
  );
}
