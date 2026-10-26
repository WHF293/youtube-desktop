import { NavLink, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Icon from "./Icon";
import { useUi } from "../stores/ui";

const NAV_ITEMS = [
  { to: "/", label: "首页", icon: "home", end: true },
  { to: "/trending", label: "热门", icon: "trending", end: false },
  { to: "/subscriptions", label: "我的订阅", icon: "subscriptions", end: false },
];

export default function Sidebar() {
  const open = useUi((s) => s.sidebarOpen);
  const setSidebar = useUi((s) => s.setSidebar);
  const location = useLocation();

  // 路由切换时把侧栏恢复为展开（窄窗口下用户收起后进新页面自动展开）
  useEffect(() => {
    setSidebar(true);
  }, [location.pathname, setSidebar]);

  if (!open) return null;

  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-line bg-surface px-2 py-2">
      <ul>
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-4 rounded-lg px-3 py-2.5 text-sm ${
                  isActive
                    ? "bg-flat font-medium text-ink"
                    : "text-ink-2 hover:bg-flat hover:text-ink"
                }`
              }
            >
              <Icon name={item.icon} size={20} />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="my-2 border-t border-line" />

      <p className="px-3 py-4 text-xs leading-5 text-ink-3">
        数据来自 YouTube Data API v3。
        <br />
        需要在右上角「设置」里配置自己的 API Key。
      </p>
    </nav>
  );
}
