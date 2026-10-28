import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChannels, buildChannelsExport } from "../../common/stores/channels";
import { useFavorites } from "../../common/stores/favorites";
import { useWatchLater } from "../../common/stores/watchLater";
import { useDownloads } from "../../common/stores/downloads";
import { errorMessage } from "../../common/stores/videos";
import { resolveChannelInput } from "../../common/lib/innertube";
import { refreshChannelsMeta } from "../../common/stores/subsFeed";
import { checkForUpdate, downloadApk, installApk, type UpdateInfo } from "../../common/lib/updater";
import { openExternal } from "../../common/lib/open";
import { YouTubeLogo, default as Icon } from "../../common/components/Icon";
import BottomSheet from "../components/BottomSheet";

/** 移动端「我的」聚合页：应用卡 + 数据概览 + 功能菜单 + 应用设置
 *  （订阅管理 / 检查更新；地区与明暗入口已移至顶部 navbar）。移动端固定直连，无网络代理入口 */
export default function MeView() {
  const navigate = useNavigate();
  const channels = useChannels((s) => s.channels);
  const groups = useChannels((s) => s.groups);
  const addChannel = useChannels((s) => s.add);
  const importJson = useChannels((s) => s.importJson);
  const favCount = useFavorites((s) => s.videos.length);
  const wlCount = useWatchLater((s) => s.entries.length);
  const dlCount = useDownloads((s) => s.tasks.filter((t) => t.status === "downloading" || t.status === "muxing").length);
  const [version, setVersion] = useState("");
  const [subsOpen, setSubsOpen] = useState(false);
  const [channelInput, setChannelInput] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [subsMsg, setSubsMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  // 检查更新：null=还没查过；"checking"=请求中；"latest"=已是最新；UpdateInfo=有新版
  const [updateState, setUpdateState] = useState<"checking" | "latest" | UpdateInfo | null>(null);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  // APK 下载中：进度百分比；null = 未在下载
  const [dlPct, setDlPct] = useState<number | null>(null);
  const updateOpen = updateState !== null;

  /** 添加订阅频道：链接/ID 自动解析（与 PC 博主管理同源逻辑） */
  const commitAdd = async () => {
    const raw = channelInput.trim();
    if (!raw || busy) return;
    setBusy(true);
    setSubsMsg(null);
    try {
      const { id, title } = await resolveChannelInput(raw);
      addChannel(id, title);
      setChannelInput("");
      setSubsMsg({ ok: true, text: `已添加「${title}」` });
      void refreshChannelsMeta();
    } catch (e) {
      setSubsMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  /** 导出订阅分组 JSON：与 PC「博主管理」同一载荷格式，复制到剪贴板（跨设备粘贴导入） */
  const copyExport = async () => {
    const text = buildChannelsExport(channels, groups);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // WebView 剪贴板权限受限时退化为展开文本，手动全选复制
      setJsonInput(text);
      setSubsMsg({ ok: true, text: "剪贴板不可用，JSON 已填入下方输入框，请手动复制" });
    }
  };

  /** 导入订阅分组 JSON：合并语义（已有博主跳过、同名分组复用），与 PC 一致 */
  const commitImport = () => {
    if (!jsonInput.trim()) return;
    try {
      const r = importJson(JSON.parse(jsonInput));
      setJsonInput("");
      setSubsMsg({
        ok: r.imported + r.groupsAdded > 0,
        text: `导入完成：新增 ${r.imported} 个博主、${r.groupsAdded} 个分组${r.skipped > 0 ? `，跳过已有 ${r.skipped} 个` : ""}`,
      });
      void refreshChannelsMeta();
    } catch {
      setSubsMsg({ ok: false, text: "JSON 解析失败：请确认粘贴的是本应用导出的备份内容" });
    }
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

  /** 应用内下载 APK → 下载完经原生桥弹系统安装界面（桥缺失时兜底跳 Release 页） */
  const startApkDownload = async () => {
    if (!updateState || typeof updateState === "string" || dlPct !== null) return;
    setUpdateErr(null);
    setDlPct(0);
    try {
      const path = await downloadApk(updateState, (downloaded, total) => {
        if (total > 0) setDlPct(Math.floor((downloaded / total) * 100));
      });
      // 未知体积时进度停在 0，下载完直接补 100
      setDlPct(100);
      if (!installApk(path)) {
        // 旧包无原生桥：兜底跳 Release 页手动下载
        void openExternal(updateState.pageUrl);
      }
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : String(e));
    } finally {
      setDlPct(null);
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
        <MenuItem
          icon="subscriptions"
          title="订阅管理"
          desc={`${channels.length} 个频道 · ${groups.length} 个分组 · 支持导入/导出 JSON`}
          onClick={() => {
            setSubsMsg(null);
            setSubsOpen(true);
          }}
        />
        <MenuItem
          icon="download"
          title="检查更新"
          desc={version ? `当前版本 v${version}` : undefined}
          onClick={() => void checkUpdate()}
        />
      </div>

      {/* 订阅管理 sheet：添加频道链接 / 导入 / 导出订阅分组 JSON（载荷与 PC 博主管理一致） */}
      <BottomSheet open={subsOpen} onClose={() => setSubsOpen(false)} title="订阅管理">
        <input
          type="text"
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          placeholder="频道链接（youtube.com/@xxx）或 UC 开头的频道 ID"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl bg-flat px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={() => void commitAdd()}
          disabled={busy || !channelInput.trim()}
          className="mt-2 w-full rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "解析中…" : "添加频道"}
        </button>

        <div className="my-3 border-t border-line" />

        <p className="mb-2 text-[12px] font-semibold text-ink-2">导入 / 导出订阅分组（JSON）</p>
        <p className="mb-2 text-[11px] leading-relaxed text-ink-3">
          与 PC「博主分组」页导出的格式一致：导入为合并语义（已有频道跳过、同名分组复用）；
          导出复制到剪贴板后到 PC 端粘贴导入，即可跨设备同步。
        </p>
        <textarea
          value={jsonInput}
          onChange={(e) => setJsonInput(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="粘贴此处导出的订阅备份 JSON…"
          className="w-full resize-y rounded-xl bg-flat px-3 py-2.5 font-mono text-[11.5px] text-ink outline-none placeholder:text-ink-3"
        />
        <div className="mb-2 mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => void copyExport()}
            disabled={channels.length === 0}
            className="m-glass-btn flex-1 justify-center disabled:opacity-50"
          >
            {copied ? "已复制 ✓" : "导出到剪贴板"}
          </button>
          <button
            type="button"
            onClick={commitImport}
            disabled={!jsonInput.trim()}
            className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            导入
          </button>
        </div>
        {subsMsg && (
          <p className={`text-[11.5px] ${subsMsg.ok ? "text-ink-2" : "text-red-500"}`}>{subsMsg.text}</p>
        )}
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
                当前 v{updateState.current}
                {updateState.size > 0 ? ` · ${(updateState.size / 1024 / 1024).toFixed(1)} MB` : ""}
              </span>
            </p>
            <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl bg-flat p-2.5 text-[11.5px] leading-relaxed text-ink-2">
              {updateState.notes || "暂无更新说明"}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              应用内直接下载，完成后自动弹出系统安装界面；首次安装需在系统弹窗中允许「安装未知应用」。
            </p>
            <div className="mb-2 mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setUpdateState(null);
                  setUpdateErr(null);
                }}
                disabled={dlPct !== null}
                className="m-glass-btn flex-1 justify-center disabled:opacity-50"
              >
                稍后再说
              </button>
              <button
                type="button"
                onClick={() => void startApkDownload()}
                disabled={dlPct !== null}
                className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-70"
              >
                {dlPct === null ? "下载并安装" : dlPct >= 100 ? "正在唤起安装…" : `下载中 ${dlPct}%`}
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
