import { useRef, useState } from "react";
import Icon from "../../common/components/Icon";
import { REGIONS, useSettings } from "../../common/stores/settings";
import RegionMenu from "./RegionMenu";

/** 页内地区选择按钮（推荐页/分类页页头共用）：scope 决定读写推荐地区还是分类地区。
 *  按钮右对齐，点击弹出 RegionMenu 浮层，选择即生效（数据刷新由 App 的地区 effect 承担） */
export default function RegionPicker({ scope }: { scope: "popular" | "category" }) {
  const popularRegionCode = useSettings((s) => s.popularRegionCode);
  const categoryRegionCode = useSettings((s) => s.regionCode);
  const setPopularRegionCode = useSettings((s) => s.setPopularRegionCode);
  const setRegionCode = useSettings((s) => s.setRegionCode);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  const region = scope === "popular" ? popularRegionCode : categoryRegionCode;
  const label = REGIONS.find(([code]) => code === region)?.[1] ?? region;

  return (
    <div className="relative ml-auto">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="地区设置"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-lg glass-btn px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:text-ink"
      >
        <Icon name="language" size={15} />
        <span className="max-w-[120px] truncate">{label}</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-full z-50 mt-1.5 w-44 rounded-xl border border-line bg-surface shadow-island">
            <RegionMenu
              regionCode={region}
              onPick={(code) => {
                (scope === "popular" ? setPopularRegionCode : setRegionCode)(code);
                setOpen(false);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
