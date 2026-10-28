import type { ReactNode } from "react";

export interface MobileNavBarProps {
  title: ReactNode;
  /** 左侧动作（如返回箭头）；缺省无 */
  left?: ReactNode;
  /** 右侧动作图标区（搜索 / 设置等） */
  right?: ReactNode;
  /** 附加 class（如 m-nav--sticky：页内自带 navbar 吸顶） */
  className?: string;
}

/** 移动端顶部导航栏（safe-area 适配，样式见 .m-nav；
 *  内容经 .m-nav__inner 包裹，tablet 档起限宽居中） */
export default function MobileNavBar({ title, left, right, className }: MobileNavBarProps) {
  return (
    <header className={`m-nav${className ? ` ${className}` : ""}`}>
      <div className="m-nav__inner">
        <div className="m-nav__title">
          {left}
          {title}
        </div>
        {right != null && <div className="m-nav__right">{right}</div>}
      </div>
    </header>
  );
}
