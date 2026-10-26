import { useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import { useVideos } from "../stores/videos";

/** 右下角固钉：刷新（仅首页/热门显示） */
export default function InfoPin() {
  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);

  // 刷新固钉只在首页 / 热门显示（两页共用 mostPopular 数据集）
  const showRefresh = location.pathname === "/" || location.pathname === "/trending";

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 保留当前分类刷新（否则切到分类 tab 后点刷新会跳回「全部」）
      await useVideos.getState().loadPopular(useVideos.getState().category);
    } finally {
      setRefreshing(false);
    }
  };

  if (!showRefresh) return null;

  return (
    <div className="fixed right-[26px] bottom-[26px] z-40">
      <button
        type="button"
        aria-label="刷新"
        title="刷新"
        onClick={() => void refresh()}
        className="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform hover:scale-105 hover:opacity-90 active:scale-95"
      >
        <Icon name="refresh" size={21} className={refreshing ? "animate-spin" : ""} />
      </button>
    </div>
  );
}
