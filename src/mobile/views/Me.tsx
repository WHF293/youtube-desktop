import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChannels } from "../../common/stores/channels";
import { useFavorites } from "../../common/stores/favorites";
import { useWatchLater } from "../../common/stores/watchLater";
import { useDownloads } from "../../common/stores/downloads";
import { useTheme } from "../../common/stores/theme";
import { YouTubeLogo, default as Icon } from "../../common/components/Icon";

/** 移动端「我的」聚合页：应用卡 + 数据概览 + 功能菜单。
 *  收藏夹/离线下载/博主分组二级页与导入导出为 M4 范围，入口先置灰。 */
export default function MeView() {
  const navigate = useNavigate();
  const channels = useChannels((s) => s.channels);
  const favCount = useFavorites((s) => s.videos.length);
  const wlCount = useWatchLater((s) => s.entries.length);
  const dlCount = useDownloads((s) => s.tasks.filter((t) => t.status === "downloading" || t.status === "muxing").length);
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void import("@tauri-apps/api/app")
      .then((m) => m.getVersion())
      .then(setVersion)
      .catch(() => setVersion("dev"));
  }, []);

  const stats = [
    { label: "订阅", value: channels.length, to: "/subscriptions" },
    { label: "收藏", value: favCount, to: null },
    { label: "待看", value: wlCount, to: "/watchlater" },
    { label: "离线", value: dlCount, to: null },
  ];

  return (
    <div>
      {/* 应用卡 */}
      <div className="mx-3.5 mt-3.5 flex items-center gap-3 rounded-2xl bg-surface p-3.5 shadow-island">
        <YouTubeLogo size={40} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold">YouTube Desktop</p>
          <p className="text-[11px] text-ink-2">
            v{version || "…"} · 本地数据 · 无账号
          </p>
        </div>
      </div>

      {/* 数据概览 */}
      <div className="mx-3.5 mt-2.5 grid grid-cols-4 overflow-hidden rounded-2xl bg-surface shadow-island">
        {stats.map((s, i) => (
          <button
            key={s.label}
            type="button"
            disabled={!s.to}
            onClick={() => s.to && navigate(s.to)}
            className={`flex flex-col items-center gap-0.5 py-3 ${
              i > 0 ? "border-l border-line" : ""
            } ${s.to ? "" : "opacity-50"}`}
          >
            <span className="text-[17px] font-extrabold">{s.value}</span>
            <span className="text-[10.5px] text-ink-2">{s.label}</span>
          </button>
        ))}
      </div>

      {/* 内容库菜单 */}
      <div className="mx-3.5 mt-2.5 overflow-hidden rounded-2xl bg-surface shadow-island">
        <MenuItem icon="star" title="收藏夹" desc={`${favCount} 个视频`} disabled />
        <MenuItem icon="download" title="离线下载" desc="M4 接入" disabled />
        <MenuItem icon="subscriptions" title="历史记录" desc="保留最近 7 天" onClick={() => navigate("/history")} />
      </div>

      {/* 应用设置 */}
      <div className="mx-3.5 mt-2.5 mb-4 overflow-hidden rounded-2xl bg-surface shadow-island">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex w-full items-center gap-3 border-b border-line px-3.5 py-3 text-left"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-flat text-[15px]">
            {theme === "dark" ? "☾" : "☀"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-semibold">明暗模式</span>
          </span>
          <span className="text-[11.5px] text-ink-3">
            {theme === "dark" ? "暗色" : "亮色"} ›
          </span>
        </button>
        <MenuItem icon="settings" title="设置（代理 / 导入导出 / 博主分组）" desc="M4 接入" disabled />
      </div>
    </div>
  );
}

function MenuItem({
  icon,
  title,
  desc,
  disabled,
  onClick,
}: {
  icon: string;
  title: string;
  desc?: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const cls = "flex w-full items-center gap-3 px-3.5 py-3 text-left";
  const inner = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-flat text-[15px]">
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold">{title}</span>
        {desc && <span className="mt-0.5 block text-[10.5px] text-ink-3">{desc}</span>}
      </span>
      <span className="text-ink-3">›</span>
    </>
  );
  if (disabled) {
    return <div className={`${cls} border-b border-line opacity-45 last:border-b-0`}>{inner}</div>;
  }
  return (
    <button type="button" onClick={onClick} className={`${cls} border-b border-line last:border-b-0`}>
      {inner}
    </button>
  );
}
