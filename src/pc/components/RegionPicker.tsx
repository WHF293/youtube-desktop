import { useRef, useState } from "react";
import Icon from "../../common/components/Icon";
import { REGIONS, useSettings } from "../../common/stores/settings";
import RegionMenu from "./RegionMenu";

/** 页内地区选择按钮（推荐页/分类页共用）：scope 决定读写推荐地区还是分类地区。
 *  variant="bar" 页头行内小圆钮（分类页）；variant="fab" 右上角悬浮固钉（推荐页）。
 *  均只显示 icon；分类地区单选（点选即收起），推荐地区多选（连续勾选，点空白处收起）。
 *  数据刷新由 App 的地区 effect / 页内逻辑承担 */
export default function RegionPicker({
  scope,
  variant = "bar",
}: {
  scope: "popular" | "category";
  variant?: "bar" | "fab";
}) {
  const popularRegionCodes = useSettings((s) => s.popularRegionCodes);
  const categoryRegionCode = useSettings((s) => s.regionCode);
  const setRegionCode = useSettings((s) => s.setRegionCode);
  const togglePopularRegion = useSettings((s) => s.togglePopularRegion);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const multiple = scope === "popular";
  const label = multiple
    ? popularRegionCodes.map((c) => REGIONS.find(([k]) => k === c)?.[1] ?? c).join("、")
    : (REGIONS.find(([code]) => code === categoryRegionCode)?.[1] ?? categoryRegionCode);

  return (
    <div className={variant === "fab" ? "fixed right-6 top-16 z-50" : "relative ml-auto shrink-0"}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`地区设置：${label}`}
        aria-expanded={open}
        title={`地区：${label}`}
        className={
          variant === "fab"
            ? "glass-btn flex h-10 w-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink"
            : "glass-btn flex h-8 w-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:text-ink"
        }
      >
        <Icon name="language" size={variant === "fab" ? 19 : 16} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-line bg-surface shadow-island">
            <RegionMenu
              regionCode={multiple ? undefined : categoryRegionCode}
              selectedCodes={multiple ? popularRegionCodes : undefined}
              onPick={(code) => {
                setRegionCode(code);
                setOpen(false);
              }}
              onToggle={multiple ? togglePopularRegion : undefined}
            />
          </div>
        </>
      )}
    </div>
  );
}
