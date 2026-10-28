import BottomSheet from "./BottomSheet";
import { REGIONS, useSettings } from "../../common/stores/settings";
import { useVideos } from "../../common/stores/videos";

/** 地区设置 sheet（首页 navbar 入口与「我的」页共用）：
 *  热门地区单选，切换后首页推荐立即按新地区重拉（仅当首页正处在 popular 模式） */
export default function RegionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const regionCode = useSettings((s) => s.regionCode);
  const setRegionCode = useSettings((s) => s.setRegionCode);

  const pickRegion = (code: string) => {
    if (code !== regionCode) {
      setRegionCode(code);
      const v = useVideos.getState();
      if (v.mode === "popular") void v.loadPopular(v.category);
    }
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="地区设置">
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        影响首页推荐与搜索的地区偏好（InnerTube gl）。不含中国大陆（实测搜索返回空结果）。
      </p>
      <div className="mb-2 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
        {REGIONS.map(([code, label]) => (
          <button
            key={code}
            type="button"
            onClick={() => pickRegion(code)}
            className={`rounded-xl px-2 py-2.5 text-[12.5px] font-medium ${
              code === regionCode ? "bg-accent text-white" : "bg-flat text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
