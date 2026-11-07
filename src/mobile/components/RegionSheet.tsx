import { useEffect, useState } from "react";
import BottomSheet from "./BottomSheet";
import { REGIONS, useSettings } from "../../common/stores/settings";
import { useVideos } from "../../common/stores/videos";
import { NEWS_CATEGORY_ID } from "../../common/lib/youtube";

/** 地区设置 sheet（推荐页/分类页 navbar 共用）：scope 决定读写推荐地区还是分类地区。
 *  分类地区单选（点选即生效并收起）；推荐地区多选——先在草稿里连续勾选，
 *  点「完成」一次性落盘并重拉推荐流（避免逐个勾选触发多次刷新） */
export default function RegionSheet({
  open,
  onClose,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  scope: "popular" | "category";
}) {
  const popularRegionCodes = useSettings((s) => s.popularRegionCodes);
  const categoryRegionCode = useSettings((s) => s.regionCode);
  const setRegionCode = useSettings((s) => s.setRegionCode);
  const setPopularRegionCodes = useSettings((s) => s.setPopularRegionCodes);

  const multiple = scope === "popular";
  const [draft, setDraft] = useState<string[]>(popularRegionCodes);

  // 每次打开时从 store 重新同步草稿（sheet 关闭期间组件仍挂载）
  useEffect(() => {
    if (open) setDraft(popularRegionCodes);
  }, [open, popularRegionCodes]);

  const pickRegion = (code: string) => {
    if (multiple) {
      // 多选草稿：切换勾选态；最后一个选中项不可取消（至少保留 1 个地区）
      setDraft((d) => (d.includes(code) ? (d.length > 1 ? d.filter((c) => c !== code) : d) : [...d, code]));
      return;
    }
    // 分类地区单选：点选即生效并收起
    if (code !== categoryRegionCode) {
      setRegionCode(code);
      // 分类地区变化：仅新闻分类跟随 gl，正看着新闻才刷新
      const v = useVideos.getState();
      if (v.mode === "popular" && v.category === NEWS_CATEGORY_ID) void v.loadPopular(v.category, true);
    }
    onClose();
  };

  const applyDraft = () => {
    const changed = draft.length > 0 && draft.join(",") !== popularRegionCodes.join(",");
    if (changed) {
      setPopularRegionCodes(draft);
      // 推荐地区变化：popular 模式下立即 force 重拉推荐流（地区频道组换血）
      const v = useVideos.getState();
      if (v.mode === "popular" && !v.category) void v.loadPopular(undefined, true);
    }
    onClose();
  };

  const current = multiple ? draft : [categoryRegionCode];

  return (
    <BottomSheet open={open} onClose={onClose} title={multiple ? "推荐地区" : "分类地区"}>
      <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
        {multiple
          ? "可多选推荐页展示的地区频道组内容（至少保留一个），与分类地区独立设置。不含中国大陆（实测搜索返回空结果）。"
          : "影响分类页「新闻」分类与搜索结果的地区偏好（InnerTube gl）。不含中国大陆（实测搜索返回空结果）。"}
      </p>
      <div className="mb-2 grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
        {REGIONS.map(([code, label]) => (
          <button
            key={code}
            type="button"
            role={multiple ? "checkbox" : "radio"}
            aria-checked={current.includes(code)}
            onClick={() => pickRegion(code)}
            className={`rounded-xl px-2 py-2.5 text-[12.5px] font-medium ${
              current.includes(code) ? "bg-accent text-white" : "bg-flat text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {multiple && (
        <button
          type="button"
          onClick={applyDraft}
          className="mb-2 w-full rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white"
        >
          完成{draft.length > 0 ? `（已选 ${draft.length} 个地区）` : ""}
        </button>
      )}
    </BottomSheet>
  );
}
