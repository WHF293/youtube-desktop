import { useEffect, useState } from "react";
import Icon from "./Icon";

/** 回到顶部固钉：监听指定滚动容器，滚过约一屏后浮现，点击带动画平滑滚回顶部。
 *  两端共用：targetId = 滚动容器（PC "main-scroll" / 移动端 "m-scroll"），
 *  className 提供定位与外观（PC .glass-btn / 移动端 .m-fab-top） */
export default function ScrollTopFab({ targetId, className }: { targetId: string; className: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const sc = document.getElementById(targetId);
    if (!sc) return;
    const on = () => setShow(sc.scrollTop > 320);
    sc.addEventListener("scroll", on, { passive: true });
    on();
    return () => sc.removeEventListener("scroll", on);
  }, [targetId]);

  if (!show) return null;
  return (
    <button
      type="button"
      aria-label="回到顶部"
      className={className}
      onClick={() => document.getElementById(targetId)?.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <Icon name="chevronUp" size={20} />
    </button>
  );
}
