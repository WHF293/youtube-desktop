import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";

/**
 * 滑动玻璃气泡（参考 whf-stock-board use-sliding-thumb 的三阶段动画）：
 * - settle：首帧落位（无动画，不播滑动）
 * - travel：滑向新目标，同时缩小到 80% 并变淡
 * - restore：到达新位置后原位回弹恢复正常
 *
 * 量取容器内第 index 个 [data-thumb-item] 元素相对容器的几何；
 * useLayoutEffect 保证首帧前落位。三阶段由 JS 相位驱动，动画确定性不依赖浏览器
 * 对 style 变更的 transition 触发。
 */

export type ThumbPhase = "settle" | "travel" | "restore";

/** travel 阶段时长（ms）：气泡带 80% 缩放滑向新目标 */
const TRAVEL_MS = 200;
/** travel 阶段缩放 */
const TRAVEL_SCALE = 0.8;
/** travel 阶段透明度 */
const TRAVEL_OPACITY = 0.6;

export interface ThumbRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SlidingThumb {
  rect: ThumbRect | null;
  phase: ThumbPhase;
}

export function useSlidingThumb(
  containerRef: RefObject<HTMLElement | null>,
  index: number,
  extraDeps: unknown[] = [],
): SlidingThumb {
  const [rect, setRect] = useState<ThumbRect | null>(null);
  const [phase, setPhase] = useState<ThumbPhase>("settle");
  const prevIndexRef = useRef(index);
  const mountedRef = useRef(false);

  const measure = useCallback(() => {
    const el = containerRef.current;
    if (!el) {
      setRect(null);
      return;
    }
    const target = el.querySelectorAll<HTMLElement>("[data-thumb-item]")[index];
    if (!target) {
      setRect(null);
      return;
    }
    setRect({
      x: target.offsetLeft,
      y: target.offsetTop,
      w: target.offsetWidth,
      h: target.offsetHeight,
    });
  }, [containerRef, index]);

  useLayoutEffect(() => {
    measure();
    if (!mountedRef.current) {
      // 首次挂载：直接落位（settle），不播滑动
      mountedRef.current = true;
      prevIndexRef.current = index;
      return;
    }
    if (prevIndexRef.current === index) return;
    prevIndexRef.current = index;
    setPhase("travel");
    const t = setTimeout(() => setPhase("restore"), TRAVEL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...extraDeps]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return { rect, phase };
}

/** 气泡内联样式：travel 阶段缩到 80% 并变淡（滑动途中），其余阶段 1:1 落位 */
export function thumbStyle(rect: ThumbRect | null, phase: ThumbPhase): CSSProperties {
  if (!rect) return {};
  const scale = phase === "travel" ? TRAVEL_SCALE : 1;
  return {
    transform: `translate(${rect.x}px, ${rect.y}px) scale(${scale})`,
    width: rect.w,
    height: rect.h,
    opacity: phase === "travel" ? TRAVEL_OPACITY : 1,
  };
}

/** 气泡三阶段的过渡类：settle 无动画 / travel 匀速滑出 / restore 回弹恢复 */
export function thumbPhaseCls(phase: ThumbPhase): string {
  if (phase === "settle") return "transition-none";
  if (phase === "travel") return "transition-[transform,width,height,opacity] duration-200 ease-out";
  return "transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.34,1.45,0.64,1)]";
}
