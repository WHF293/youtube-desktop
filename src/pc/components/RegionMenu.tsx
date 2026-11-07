import { useRef } from "react";
import { REGIONS } from "../../common/stores/settings";
import { thumbPhaseCls, thumbStyle, useSlidingThumb } from "../../common/lib/useSlidingThumb";

/** 地区选择浮层（滑动玻璃气泡选中态；独立组件 = 每次打开重新量取气泡几何）。
 *  推荐页/分类页页内地区设置共用；定位外壳（锚点与层级）由调用方提供。
 *  单选模式（分类地区）：传 regionCode + onPick，点选即回调由调用方收起浮层；
 *  多选模式（推荐地区）：传 selectedCodes + onToggle，点选切换勾选态，浮层保持打开供连续勾选 */
export default function RegionMenu({
  regionCode,
  selectedCodes,
  onPick,
  onToggle,
}: {
  /** 单选模式当前地区 */
  regionCode?: string;
  /** 多选模式当前地区集合（传入即启用多选） */
  selectedCodes?: string[];
  onPick?: (code: string) => void;
  onToggle?: (code: string) => void;
}) {
  const multiple = !!selectedCodes;
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
      {!multiple && rect && (
        <span
          aria-hidden
          className={`glass-btn glass-thumb pointer-events-none left-0 top-0 rounded-lg ${thumbPhaseCls(phase)}`}
          style={thumbStyle(rect, phase)}
        />
      )}
      {REGIONS.map(([code, label]) => {
        const selected = multiple ? selectedCodes!.includes(code) : code === regionCode;
        return (
          <button
            key={code}
            type="button"
            role={multiple ? "menuitemcheckbox" : "menuitemradio"}
            data-thumb-item={multiple ? undefined : ""}
            aria-checked={selected}
            onClick={() => (multiple ? onToggle?.(code) : onPick?.(code))}
            className={`relative flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-flat ${
              selected ? "font-medium text-accent" : "text-ink"
            }`}
          >
            <span>
              {label}（{code}）
            </span>
            {selected && (multiple ? <span className="text-xs">✓</span> : <span className="text-xs">当前</span>)}
          </button>
        );
      })}
      {multiple && (
        <div className="border-t border-line px-3 py-1.5 text-[11px] leading-snug text-ink-3">
          可多选，至少保留一个；点空白处收起
        </div>
      )}
    </div>
  );
}
