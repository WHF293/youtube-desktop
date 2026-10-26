import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";

/**
 * 滑动玻璃气泡定位（参考 whf-stock-board use-sliding-thumb 的量取逻辑）：
 * 量取容器内第 index 个 [data-thumb-item] 元素相对容器的几何，
 * 供绝对定位的 .glass-btn 气泡以 transform 过渡滑动到当前项。
 * useLayoutEffect 保证首帧前落位（首次出现不播滑动动画）。
 */

export interface ThumbRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function useSlidingThumb(
  containerRef: RefObject<HTMLElement | null>,
  index: number,
  extraDeps: unknown[] = [],
): ThumbRect | null {
  const [rect, setRect] = useState<ThumbRect | null>(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, ...extraDeps]);

  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return rect;
}
