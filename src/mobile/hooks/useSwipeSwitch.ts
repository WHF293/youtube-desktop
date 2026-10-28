import { useEffect, useRef } from "react";

interface SwipeSwitchOptions {
  /** 选项总数 */
  count: number;
  /** 当前选中下标（用于边界钳制） */
  index: number;
  /** 切换回调：收到相邻下标；边界（首项右滑 / 末项左滑）不回调、不循环 */
  onChange: (next: number) => void;
}

/** 有效横滑阈值：水平位移至少 60px 且显著大于垂直位移（避免与纵向滚动/下拉刷新抢手势） */
const SWIPE_MIN_PX = 60;
const SWIPE_AXIS_RATIO = 1.5;

/** 列表页左右滑动切换分类/分组：绑在列表内容区（不含顶部 chips 条，避免与其横向滚动冲突）。
 *  向左滑 = 下一个、向右滑 = 上一个；到边界后继续滑不生效。 */
export default function useSwipeSwitch<T extends HTMLElement>({ count, index, onChange }: SwipeSwitchOptions) {
  const ref = useRef<T | null>(null);
  // 回调经 ref 透传，避免 options 变化导致监听器反复重挂
  const cb = useRef(onChange);
  cb.current = onChange;
  const idx = useRef(index);
  idx.current = index;

  useEffect(() => {
    const el = ref.current;
    if (!el || count <= 1) return;
    let startX = 0;
    let startY = 0;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_AXIS_RATIO) return;
      const next = idx.current + (dx < 0 ? 1 : -1);
      if (next < 0 || next >= count) return; // 边界钳制：不循环
      cb.current(next);
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchend", onEnd);
    };
  }, [count]);

  return ref;
}
