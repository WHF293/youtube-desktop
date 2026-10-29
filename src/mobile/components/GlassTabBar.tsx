import { useEffect, useRef, useState } from "react";
import Icon from "../../common/components/Icon";

/** 底部四主 Tab（历史 2026-10-28 移入「我的」页；与 .m-tabbar 的 /4 同步）。
 *  NavigationRail（大屏侧边导航）复用同一份 TABS，改这里两处同步生效。 */
export const TABS = [
  { to: "/", label: "首页", icon: "home" },
  { to: "/subscriptions", label: "订阅", icon: "subscriptions" },
  { to: "/watchlater", label: "待看", icon: "watchLater" },
  { to: "/me", label: "我的", icon: "settings" },
] as const;

/* 指示气泡动画参数（对齐 whf-stock-board MobileTabBar / DESIGN-MOBILE.md §2.2）：
 * 点击切换 = 行程滑动（缩小+降透明）→ 接近落点回弹放大恢复（液态玻璃手感）；
 * 按住气泡左右拖拽 = 关过渡 px 级跟手，松手吸附最近 tab。 */
const THUMB_TRAVEL_MS = 340;
const THUMB_EASE_TRAVEL = "cubic-bezier(0.16, 1, 0.3, 1)";
const THUMB_TRAVEL_SCALE = 0.8;
const THUMB_TRAVEL_OPACITY = "0.55";
const THUMB_RESTORE_DELAY_MS = 160;
const THUMB_RESTORE_MS = 220;
const THUMB_EASE_RESTORE = "cubic-bezier(0.3, 1.35, 0.6, 1)";
const DRAG_SLOP_PX = 8;

export interface GlassTabBarProps {
  /** 当前激活的 Tab 路由（精确匹配 TABS 的 to） */
  active: string;
  /** 「我的」角标：离线下载队列进行中数量（>0 显示） */
  badge?: number;
  /** 二级页（入口不在 TabBar）：手机档由 CSS 隐藏（pad 竖屏保持显示，见 mobile.css 媒体查询） */
  secondary?: boolean;
  onSelect: (to: string) => void;
}

/** 底部 TabBar：iOS 柔光玻璃悬浮胶囊 + 滑动指示气泡。
 *  气泡支持跟手拖拽：pointerdown 在玻璃底座任意位置 → 越过 slop 进入拖拽（气泡关过渡、
 *  px 级跟手、缩至行程档）→ 松手吸附最近 tab 并跳转 + 回弹恢复（规格同
 *  whf-stock-board MobileTabBar）。位移小于 slop 视为普通点击，行为不变。 */
export default function GlassTabBar({ active, badge = 0, secondary, onSelect }: GlassTabBarProps) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.to === active),
  );
  const navRef = useRef<HTMLElement | null>(null);
  const [thumbStyle, setThumbStyle] = useState<{ transform: string; transition: string; opacity: string }>(() => ({
    transform: `translateX(${activeIndex * 100}%)`,
    transition: "",
    opacity: "1",
  }));
  const st = useRef({
    dragging: false,
    dragArmed: false,
    downX: 0,
    pointerId: null as number | null,
    navRect: null as DOMRect | null,
    slotWidth: 0,
    suppressClick: false,
    skipNextTravel: false,
    restoreTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  });

  /** 拖拽中气泡的 translateX（px）：clamp 在玻璃底座内（左右各 6px padding） */
  const dragTranslateX = (clientX: number): string => {
    const { navRect, slotWidth } = st.current;
    if (!navRect) return "0px";
    const max = Math.max(navRect.width - 12 - slotWidth, 0);
    const raw = clientX - navRect.left - 6 - slotWidth / 2;
    return `${Math.min(Math.max(raw, 0), max)}px`;
  };

  const enterDrag = (clientX: number) => {
    st.current.dragging = true;
    setThumbStyle({
      transform: `translateX(${dragTranslateX(clientX)}) scale(${THUMB_TRAVEL_SCALE})`,
      transition: "none",
      opacity: THUMB_TRAVEL_OPACITY,
    });
  };

  const endDrag = (clientX: number) => {
    const s = st.current;
    if (!s.dragging || !s.navRect) return;
    s.dragging = false;
    clearTimeout(s.restoreTimer);
    const idx = Math.min(
      Math.max(Math.floor((clientX - s.navRect.left - 6) / s.slotWidth), 0),
      TABS.length - 1,
    );
    const settle = (target: number) => {
      setThumbStyle({
        transform: `translateX(${target * 100}%) scale(1)`,
        transition: `transform ${THUMB_RESTORE_MS}ms ${THUMB_EASE_RESTORE}, opacity ${THUMB_RESTORE_MS}ms ease`,
        opacity: "1",
      });
    };
    if (idx !== activeIndex) {
      // 吸附目标 ≠ 当前 tab：跳转路由；active 变化时跳过行程动画，气泡直接回弹落定
      s.skipNextTravel = true;
      settle(idx);
      onSelect(TABS[idx].to);
    } else {
      settle(idx);
    }
    // 吞掉本次手势产生的 click，防止松手位置按钮的二次触发
    s.suppressClick = true;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = st.current;
    if (s.dragging || !e.isPrimary) return;
    // 底座任意位置按住即可起拖（气泡所在 slot 不限；thumb 本身 pointer-events:none）
    const nav = navRef.current;
    if (!nav) return;
    s.navRect = nav.getBoundingClientRect();
    s.slotWidth = (s.navRect.width - 12) / TABS.length;
    s.downX = e.clientX;
    s.dragArmed = false;
    s.pointerId = e.pointerId;
    // 合成事件 / 不支持 pointer capture 的环境下静默降级为纯点击
    try {
      nav.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = st.current;
    if (s.pointerId === null || e.pointerId !== s.pointerId) return;
    if (!s.dragging) {
      // 未过 slop 前不干扰普通点击；越过即进入跟手态
      if (!s.dragArmed && Math.abs(e.clientX - s.downX) >= DRAG_SLOP_PX) {
        s.dragArmed = true;
        enterDrag(e.clientX);
      }
      return;
    }
    setThumbStyle((prev) => ({
      ...prev,
      transform: `translateX(${dragTranslateX(e.clientX)}) scale(${THUMB_TRAVEL_SCALE})`,
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = st.current;
    if (s.pointerId === null || e.pointerId !== s.pointerId) return;
    s.pointerId = null;
    if (s.dragging) endDrag(e.clientX);
  };

  const onClickCapture = (e: React.MouseEvent) => {
    const s = st.current;
    if (!s.suppressClick) return;
    s.suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // 点击切换（非拖拽吸附）：行程滑动 + 缩小变透明 → 落点回弹放大恢复
  useEffect(() => {
    const s = st.current;
    if (s.skipNextTravel) {
      s.skipNextTravel = false;
      return;
    }
    clearTimeout(s.restoreTimer);
    setThumbStyle({
      transform: `translateX(${activeIndex * 100}%) scale(${THUMB_TRAVEL_SCALE})`,
      transition: `transform ${THUMB_TRAVEL_MS}ms ${THUMB_EASE_TRAVEL}, opacity ${THUMB_TRAVEL_MS}ms ease`,
      opacity: THUMB_TRAVEL_OPACITY,
    });
    s.restoreTimer = setTimeout(() => {
      setThumbStyle({
        transform: `translateX(${activeIndex * 100}%) scale(1)`,
        transition: `transform ${THUMB_RESTORE_MS}ms ${THUMB_EASE_RESTORE}, opacity ${THUMB_RESTORE_MS}ms ease`,
        opacity: "1",
      });
    }, THUMB_RESTORE_DELAY_MS);
    return () => clearTimeout(s.restoreTimer);
  }, [activeIndex]);

  return (
    <nav
      ref={navRef}
      className={`m-tabbar${secondary ? " m-tabbar--secondary" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
      onDragStart={(e) => e.preventDefault()}
    >
      <span className="m-tabbar__thumb" style={thumbStyle} />
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
