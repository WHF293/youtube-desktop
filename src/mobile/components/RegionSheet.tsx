import BottomSheet from "./BottomSheet";
import { REGIONS, useSettings } from "../../common/stores/settings";
import { useVideos } from "../../common/stores/videos";
import { NEWS_CATEGORY_ID } from "../../common/lib/youtube";

/** 地区设置 sheet（推荐页/分类页 navbar 共用）：scope 决定读写推荐地区还是分类地区。
 *  热门地区单选；推荐地区切换后推荐流立即重拉，分类地区仅影响新闻分类与搜索（InnerTube gl） */
export default function RegionSheet({
  open,
  onClose,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  scope: "popular" | "category";
}) {
  const popularRegionCode = useSettings((s) => s.popularRegionCode);
  const categoryRegionCode = useSettings((s) => s.regionCode);
  const setPopularRegionCode = useSettings((s) => s.setPopularRegionCode);
  const setRegionCode = useSettings((s) => s.setRegionCode);

  const regionCode = scope === "popular" ? popularRegionCode : categoryRegionCode;

  const pickRegion = (code: string) => {
    if (code !== regionCode) {
      if (scope === "popular") {
        setPopularRegionCode(code);
        // 推荐地区变化：popular 模式下立即 force 重拉推荐流（地区频道组换血）
        const v = useVideos.getState();
        if (v.mode === "popular" && !v.category) void v.loadPopular(undefined, true);
      } else {
        setRegionCode(code);
        // 分类地区变化：仅新闻分类跟随 gl，正看着新闻才刷新
        const v = useVideos.getState();
        if (v.mode === "popular" && v.category === NEWS_CATEGORY_ID) void v.loadPopular(v.category, true);
      }
    }
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={scope === "popular" ? "推荐地区" : "分类地区"}>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        {scope === "popular"
          ? "影响推荐页的地区频道组内容，与分类地区独立设置。不含中国大陆（实测搜索返回空结果）。"
          : "影响分类页「新闻」分类与搜索结果的地区偏好（InnerTube gl）。不含中国大陆（实测搜索返回空结果）。"}
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
