import type { ReactNode } from "react";

export interface MobileNavBarProps {
  title: ReactNode;
  /** 左侧动作（如返回箭头）；缺省无 */
  left?: ReactNode;
  /** 右侧动作图标区（搜索 / 设置等） */
  right?: ReactNode;
}

/** 移动端顶部导航栏（safe-area 适配，样式见 .m-nav） */
export default function MobileNavBar({ title, left, right }: MobileNavBarProps) {
  return (
    <header className="m-nav">
      <div className="m-nav__title">
        {left}
        {title}
      </div>
      {right != null && <div className="m-nav__right">{right}</div>}
    </header>
  );
}
