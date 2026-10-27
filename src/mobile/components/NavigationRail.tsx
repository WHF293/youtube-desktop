import { useNavigate } from "react-router-dom";
import Icon from "../../common/components/Icon";
import { TABS } from "./GlassTabBar";

export interface NavigationRailProps {
  /** 当前激活的 Tab 路由（与 GlassTabBar 同一套 activeTabOf 判定） */
  active: string;
  /** 「我的」角标：离线下载队列进行中数量（>0 显示） */
  badge?: number;
}

/** 大屏侧边导航（≥840dp Expanded 档，UI 稿 A2/A3）：
 *  取代底部玻璃 TabBar；显示/隐藏由 .m-rail 的媒体查询控制（<840 display:none）。 */
export default function NavigationRail({ active, badge = 0 }: NavigationRailProps) {
  const navigate = useNavigate();
  return (
    <nav className="m-rail" aria-label="侧边导航">
      <span className="m-rail__logo">
        <span className="m-rail__mark" aria-hidden="true" />
      </span>
      {TABS.map((tab) => (
        <button
          key={tab.to}
          type="button"
          className={`m-rail__item${tab.to === active ? " active" : ""}`}
          onClick={() => navigate(tab.to)}
        >
          {tab.to === "/me" && badge > 0 && <span className="m-rail__badge">{badge}</span>}
          <span className="m-rail__icon">
            <Icon name={tab.icon} size={19} />
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
