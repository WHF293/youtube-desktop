import { useRef, type RefObject } from "react";
import { useSlidingThumb } from "../lib/useSlidingThumb";

/**
 * 高光玻璃按钮组（参考 whf-stock-board 按钮组）：底部一条玻璃轨道，
 * 选中项背后是滑动玻璃气泡（切换时弹性过渡滑到新位置）。
 * 容器内直接子 button 需带 data-thumb-item（由组件内部添加）。
 */
export default function GlassChipGroup<T extends string>({
  options,
  value,
  onChange,
  wrap = true,
  className = "",
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** true = 换行铺排（设置页）；false = 单行横向滚动（首页分类 tab） */
  wrap?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>;
  const activeIndex = options.findIndex((o) => o.value === value);
  const rect = useSlidingThumb(ref, activeIndex);

  return (
    <div
      ref={ref}
      className={`relative inline-flex gap-1 rounded-xl bg-flat p-1 ${
        wrap ? "flex-wrap" : "flex-nowrap"
      } ${className}`}
    >
      {rect && (
        <span
          aria-hidden
          className="glass-btn pointer-events-none absolute left-0 top-0 rounded-full transition-[transform,width,height] duration-300 ease-[cubic-bezier(0.3,1.2,0.5,1)]"
          style={{ transform: `translate(${rect.x}px, ${rect.y}px)`, width: rect.w, height: rect.h }}
        />
      )}
      {options.map((o) => (
        <button
          key={o.value}
          data-thumb-item
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={o.value === value}
          className={`relative shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-xs transition-colors ${
            o.value === value ? "font-medium text-accent" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
