import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useChannels } from "../../common/stores/channels";
import { useFavorites } from "../../common/stores/favorites";
import { useWatchLater } from "../../common/stores/watchLater";
import { useDownloads } from "../../common/stores/downloads";
import { useTheme } from "../../common/stores/theme";
import { useSettings, DEFAULT_PROXY } from "../../common/stores/settings";
import { checkForUpdate, type UpdateInfo } from "../../common/lib/updater";
import { openExternal } from "../../common/lib/open";
import { YouTubeLogo, default as Icon } from "../../common/components/Icon";
import BottomSheet from "../components/BottomSheet";

/** 移动端「我的」聚合页：应用卡 + 数据概览 + 功能菜单 + 网络代理设置。 */
export default function MeView() {
  const navigate = useNavigate();
  const channels = useChannels((s) => s.channels);
  const favCount = useFavorites((s) => s.videos.length);
  const wlCount = useWatchLater((s) => s.entries.length);
  const dlCount = useDownloads((s) => s.tasks.filter((t) => t.status === "downloading" || t.status === "muxing").length);
  const theme = useTheme((s) => s.theme);
  const toggleTheme = useTheme((s) => s.toggle);
  const settings = useSettings();
  const setProxy = useSettings((s) => s.setProxy);
  const [version, setVersion] = useState("");
  const [proxyOpen, setProxyOpen] = useState(false);
  const [proxyInput, setProxyInput] = useState(settings.proxy);
  const [proxyErr, setProxyErr] = useState<string | null>(null);
  // 检查更新：null=还没查过；"checking"=请求中；"latest"=已是最新；UpdateInfo=有新版
  const [updateState, setUpdateState] = useState<"checking" | "latest" | UpdateInfo | null>(null);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  const updateOpen = updateState !== null;

  /** 保存代理：与 PC 端一致（只 trim，协议由 Rust 侧兼容）；写入 settings
   *  （zustand persist）即时生效于 API/图片/下载请求；save_webview_proxy
   *  在 Android 是空实现，调用保持通道一致不报错 */
  const saveProxy = () => {
    const p = proxyInput.trim();
    if (p && !/^[\w.-]+(:\d{2,5})?$/.test(p) && !/^https?:\/\/.+/.test(p)) {
      setProxyErr("格式不对：应为 host:port 或完整 http(s) URL");
      return;
    }
    setProxyErr(null);
    setProxy(p);
    if (isTauri()) void invoke("save_webview_proxy", { proxy: p }).catch(() => {});
    setProxyOpen(false);
  };

  /** 检查更新（APK 口径）：走 yt_fetch 查 GitHub Releases，有新版弹 sheet 引导
   *  到 Release 页手动下载安装（Android 应用内静默安装需原生安装器，未做） */
  const checkUpdate = async () => {
    setUpdateErr(null);
    setUpdateState("checking");
    try {
      const info = await checkForUpdate("apk");
      setUpdateState(info ?? "latest");
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : String(e));
    }
  };

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
    <div className="m-page">
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
        <MenuItem icon="subscriptions" title="历史记录" desc="保留最近 7 天" onClick={() => navigate("/history")} />
        <MenuItem
          icon="download"
          title="离线下载"
          desc={dlCount > 0 ? `${dlCount} 个任务进行中` : "本地缓存视频"}
          onClick={() => navigate("/offline")}
        />
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
        <MenuItem
          icon="settings"
          title="网络代理"
          desc={settings.proxy || "未配置（直连）"}
          onClick={() => {
            setProxyInput(settings.proxy);
            setProxyOpen(true);
          }}
        />
        <MenuItem
          icon="download"
          title="检查更新"
          desc={version ? `当前版本 v${version}` : undefined}
          onClick={() => void checkUpdate()}
        />
      </div>

      {/* 网络代理设置 sheet：保存即时生效（API/图片请求走 Rust 代理参数；
          视频 iframe 走 WebView 启动注入的代理，修改后需重启 App） */}
      <BottomSheet open={proxyOpen} onClose={() => setProxyOpen(false)} title="网络代理">
        <p className="mb-3 text-[11.5px] leading-relaxed text-ink-3">
          国内直连 YouTube 不可达，默认走本地代理。支持 host:port 或完整 http(s) URL，
          保存后 API / 图片 / 下载请求即时生效。
        </p>
        <input
          type="text"
          value={proxyInput}
          onChange={(e) => setProxyInput(e.target.value)}
          placeholder={DEFAULT_PROXY}
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="mb-1 w-full rounded-xl bg-flat px-3.5 py-2.5 text-[13.5px] text-ink outline-none placeholder:text-ink-3"
        />
        {proxyErr && <p className="mb-1 text-[11px] text-red-500">{proxyErr}</p>}
        <div className="mb-2 mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setProxyInput(DEFAULT_PROXY);
              proxyErr && setProxyErr(null);
            }}
            className="m-glass-btn flex-1 justify-center"
          >
            恢复默认
          </button>
          <button
            type="button"
            onClick={saveProxy}
            className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white"
          >
            保存
          </button>
        </div>
      </BottomSheet>
      {/* 检查更新结果 sheet */}
      <BottomSheet
        open={updateOpen}
        onClose={() => {
          setUpdateState(null);
          setUpdateErr(null);
        }}
        title="检查更新"
      >
        {updateErr ? (
          <>
            <p className="mb-4 text-[13px] leading-relaxed text-ink-2">{updateErr}</p>
            <button
              type="button"
              onClick={() => void checkUpdate()}
              className="m-glass-btn mb-2 w-full justify-center"
            >
              重试
            </button>
          </>
        ) : updateState === "checking" ? (
          <p className="py-4 text-center text-[13px] text-ink-2">正在检查…</p>
        ) : updateState === "latest" ? (
          <p className="py-4 text-center text-[13px] text-ink-2">已是最新版本 🎉</p>
        ) : updateState ? (
          <>
            <p className="text-[14px] font-bold text-ink">
              发现新版本 v{updateState.latest}
              <span className="ml-2 text-[11px] font-normal text-ink-3">
                当前 v{updateState.current} · {(updateState.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </p>
            <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-flat p-2.5 text-[11.5px] leading-relaxed text-ink-2">
              {updateState.notes || "暂无更新说明"}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              将跳转浏览器下载 APK；若提示「未知来源」，允许安装本应用来源即可。
            </p>
            <div className="mb-2 mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUpdateState(null);
                  void openExternal(updateState.pageUrl);
                }}
                className="m-glass-btn flex-1 justify-center"
              >
                稍后再说
              </button>
              <button
                type="button"
                onClick={() => void openExternal(updateState.pageUrl)}
                className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white"
              >
                打开下载页
              </button>
            </div>
          </>
        ) : null}
      </BottomSheet>
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
