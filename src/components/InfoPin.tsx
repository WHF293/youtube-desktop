import { useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import { useVideos } from "../stores/videos";

/** 右下角固钉组：刷新（仅首页/热门显示）+ 数据来源说明 */
export default function InfoPin() {
  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);

  // 刷新固钉只在首页 / 热门显示（两页共用 mostPopular 数据集）
  const showRefresh = location.pathname === "/" || location.pathname === "/trending";

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await useVideos.getState().loadPopular(); // 不看缓存状态，强制重新请求
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-center gap-2">
      {/* 刷新固钉（首页/热门） */}
      {showRefresh && (
        <button
          type="button"
          aria-label="刷新"
          title="刷新"
          onClick={() => void refresh()}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform hover:scale-105 hover:opacity-90 active:scale-95"
        >
          <Icon name="refresh" size={16} className={refreshing ? "animate-spin" : ""} />
        </button>
      )}

      {/* 说明固钉 */}
      <div className="group">
        {/* hover 说明卡片（红底白字） */}
        <div className="pointer-events-none absolute right-12 bottom-0 w-64 rounded-lg bg-accent p-3 text-xs leading-5 text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
          数据来自 YouTube Data API v3。
          <br />
          需要在右上角「设置」里配置自己的 API Key。
        </div>
        <button
          type="button"
          aria-label="数据来源说明"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform hover:scale-105 hover:opacity-90"
        >
          <Icon name="info" size={16} />
        </button>
      </div>
    </div>
  );
}
