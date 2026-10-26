import { useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "./Icon";
import { runPageRefresh } from "../lib/refresh";

/** 右下角固钉：刷新（首页 / 订阅 / 收藏 / 博主分组 / 离线视频）。
 *  各页面挂载时经 registerPageRefresh 注册自己的刷新动作，未注册的路径不显示 */
const REFRESH_PATHS = new Set(["/", "/subscriptions", "/favorites", "/groups", "/offline"]);

export default function InfoPin() {
  const location = useLocation();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      // 最少转 500ms：本地数据页（收藏/分组元数据）刷新很快，避免按钮一闪而过
      await Promise.all([
        Promise.resolve().then(() => runPageRefresh(location.pathname)),
        new Promise((r) => setTimeout(r, 500)),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  if (!REFRESH_PATHS.has(location.pathname)) return null;

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
