import { useEffect, useRef, useState } from "react";

interface SwipeSwitchOptions {
  /** 选项总数 */
  count: number;
  /** 当前选中下标（用于边界钳制与相邻面板显隐） */
  index: number;
  /** 切换回调：动画滑入相邻骨架屏结束时收到相邻下标；边界（首项右滑 / 末项左滑）不回调、不循环 */
  onChange: (next: number) => void;
}

/** 手势参数：轴向锁定 / 边界阻尼 / 轻扫判定 / 过渡时长 */
const AXIS_LOCK_PX = 12;
const AXIS_RATIO = 1.2;
const OVERDRAG_DAMP = 0.28;
const FLICK_MIN_PX = 40;
const FLICK_VELOCITY = 0.5; // px/ms
const ANIM_MS = 260;
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";

/** 手势阶段（渲染态）：null 静止 / drag 跟手拖拽 / next+prev 过渡到相邻页 / back 回弹。
 *  非 null 时视图需挂载两侧相邻骨架屏面板（随容器位移）并给容器加过渡。 */
export type SwipePhase = "drag" | "next" | "prev" | "back" | null;

/** 列表页左右滑动切换分类/分组（swiper 式）：
 *  手指按下列后横向位移占优即进入跟手拖拽（两侧骨架屏一起位移），松手按位移阈值或
 *  轻扫速度判定——过阈值动画滑入相邻骨架屏、动画结束时 onChange 发真实请求，否则回弹；
 *  首尾边界拖拽带橡皮筋阻尼。手势绑在列表内容区（不含顶部 chips 条，避免与其横向滚动
 *  冲突）；容器需 style.touchAction="pan-y" + overflow-x-clip，让纵向滚动交给原生。
 *
 *  返回值用法：
 *  - ref：绑到列表内容区包装元素；
 *  - containerStyle：绑到内容容器（位移 + 过渡）；
 *  - phase：非 null 时在容器内渲染两侧面板（`absolute inset-y-0 right-full/left-full w-full`）。 */
export default function useSwipeSwitch<T extends HTMLElement>({ count, index, onChange }: SwipeSwitchOptions) {
  const ref = useRef<T | null>(null);
  // 回调经 ref 透传，避免 options 变化导致监听器反复重挂
  const cb = useRef(onChange);
  cb.current = onChange;
  const idx = useRef(index);
  idx.current = index;

  /** 容器横向位移（px）：拖拽跟随手指，过渡动画到 ±容器宽 */
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<SwipePhase>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || count <= 1) return;
    // 手势状态机：0 静止 / 1 待定（轴向未锁） / 2 跟手拖拽 / 3 过渡动画中
    let mode = 0;
    let dead = false; // 本轮触摸已判给纵向滚动，忽略到抬起为止
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastT = 0;
    let vel = 0;
    let lastDx = 0;
    let width = 0;
    let timer: number | undefined;

    const settle = (p: SwipePhase, after: () => void) => {
      mode = 3;
      setPhase(p);
      // 动画时长兜底定时器：transitionend 可能因打断丢失，超时强制收尾
      timer = window.setTimeout(() => {
        after();
        setDx(0);
        setPhase(null);
        mode = 0;
      }, ANIM_MS + 40);
    };

    const onStart = (e: TouchEvent) => {
      if (mode !== 0) return; // 过渡中不接新手势
      const t = e.touches[0];
      if (!t) return;
      mode = 1;
      dead = false;
      startX = lastX = t.clientX;
      startY = t.clientY;
      lastT = performance.now();
      vel = 0;
      lastDx = 0;
      width = el.clientWidth || window.innerWidth;
    };

    const onMove = (e: TouchEvent) => {
      if (mode === 0 || mode === 3 || dead) return;
      const t = e.touches[0];
      if (!t) return;
      const rawDx = t.clientX - startX;
      const rawDy = t.clientY - startY;
      if (mode === 1) {
        // 轴向锁定：横向占优进入跟手，纵向占优整轮放弃（让位原生滚动）
        if (Math.abs(rawDx) >= AXIS_LOCK_PX && Math.abs(rawDx) > Math.abs(rawDy) * AXIS_RATIO) {
          mode = 2;
        } else if (Math.abs(rawDy) >= AXIS_LOCK_PX) {
          dead = true;
          return;
        } else {
          return;
        }
      }
      // 跟手拖拽：拦下纵向滚动（touch-action pan-y 下事件仍可取消），边界侧橡皮筋阻尼
      e.preventDefault();
      let d = rawDx;
      if ((idx.current === 0 && d > 0) || (idx.current === count - 1 && d < 0)) d *= OVERDRAG_DAMP;
      d = Math.max(-width, Math.min(width, d));
      const now = performance.now();
      vel = (t.clientX - lastX) / Math.max(1, now - lastT);
      lastX = t.clientX;
      lastT = now;
      lastDx = d;
      setDx(d);
      setPhase((p) => (p === "drag" ? p : "drag"));
    };

    const onEnd = () => {
      if (mode === 2) {
        const threshold = Math.max(60, width * 0.2);
        const flick = Math.abs(lastDx) >= FLICK_MIN_PX && Math.abs(vel) >= FLICK_VELOCITY;
        const dir = lastDx <= -threshold || (lastDx < 0 && flick) ? "next" : lastDx >= threshold || (lastDx > 0 && flick) ? "prev" : null;
        const target = dir === "next" ? idx.current + 1 : dir === "prev" ? idx.current - 1 : -1;
        if (dir && target >= 0 && target < count) {
          // 过阈值：动画滑入相邻骨架屏，动画结束才切数据源发真实请求
          settle(dir, () => cb.current(target));
          setDx(dir === "next" ? -width : width);
          return;
        }
        // 未过阈值 / 边界越拖：回弹
        settle("back", () => {});
        setDx(0);
        return;
      }
      mode = 0;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [count]);

  const containerStyle = {
    transform: `translateX(${dx}px)`,
    transition: phase === "next" || phase === "prev" || phase === "back" ? `transform ${ANIM_MS}ms ${EASE}` : undefined,
  } as const;

  return { ref, dx, phase, containerStyle };
}
