import { useRef } from "react";
import { REGIONS } from "../../common/stores/settings";
import { thumbPhaseCls, thumbStyle, useSlidingThumb } from "../../common/lib/useSlidingThumb";

/** 地区选择浮层（滑动玻璃气泡选中态；独立组件 = 每次打开重新量取气泡几何）。
 *  推荐页/分类页页内地区设置共用；定位外壳（锚点与层级）由调用方提供 */
export default function RegionMenu({
  regionCode,
  onPick,
}: {
  regionCode: string;
  onPick: (code: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const activeIndex = REGIONS.findIndex(([code]) => code === regionCode);
  const { rect, phase } = useSlidingThumb(ref, activeIndex);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="选择地区"
      className="relative overflow-y-auto rounded-xl py-1"
      style={{ maxHeight: "min(480px, calc(100vh - 24px))" }}
    >
      {rect && (
        <span
          aria-hidden
          className={`glass-btn glass-thumb pointer-events-none left-0 top-0 rounded-lg ${thumbPhaseCls(phase)}`}
          style={thumbStyle(rect, phase)}
        />
      )}
      {REGIONS.map(([code, label]) => (
        <button
          key={code}
          type="button"
          role="menuitemradio"
          data-thumb-item
          aria-checked={code === regionCode}
          onClick={() => onPick(code)}
          className={`relative flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-flat ${
            code === regionCode ? "font-medium text-accent" : "text-ink"
          }`}
        >
          <span>
            {label}（{code}）
          </span>
          {code === regionCode && <span className="text-xs">当前</span>}
        </button>
      ))}
    </div>
  );
}
