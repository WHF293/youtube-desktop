import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettings, DEFAULT_PROXY, CONTENT_LANGS, DEFAULT_DOWNLOAD_DIR, DOWNLOAD_QUALITIES } from "../stores/settings";
import { openExternal } from "../lib/open";
import GlassChipGroup from "../components/GlassChipGroup";
import ChannelManager from "./ChannelManager";
import Icon from "../components/Icon";

/** 项目仓库地址（设置页「关于」展示 + 系统浏览器打开） */
const REPO_URL = "https://github.com/WHF293/youtube-desktop";

function GroupTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-xs font-medium tracking-wide text-ink-3 uppercase">{children}</h2>;
}

function FieldTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-ink">{children}</h2>;
}

function FieldDesc({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-5 text-ink-2">{children}</p>;
}

/**
 * 设置页：官方 YouTube Data API 已下线，应用固定走 FreeTube 模式
 * （InnerTube/RSS，无需 API Key 与任何登录），全部配置即时生效。
 */
export default function Settings() {
  const settings = useSettings();
  // 单选 UI；老版本持久化的多语言数据收敛为第一个（InnerTube 侧本就只取 languages[0]）
  const [langs, setLangs] = useState<string[]>(settings.languages.slice(0, 1));
  const [proxy, setProxy] = useState(settings.proxy);
  const [ffmpegInput, setFfmpegInput] = useState(settings.ffmpegPath);

  const toggleLang = (code: string) => {
    // 单选：搜索只请求该一种语言（InnerTube context.hl），即选即生效
    setLangs([code]);
    settings.setLanguages([code]);
  };

  /** 代理输入框失焦 / 回车即保存（API 与图片请求即时生效） */
  const commitProxy = () => {
    const p = proxy.trim();
    settings.setProxy(p);
    if (isTauri()) void invoke("save_webview_proxy", { proxy: p }).catch(() => {});
  };

  /** 打开系统选择器并应用所选路径（失败弹窗提示，不静默） */
  const pickPath = async (opts: Parameters<typeof open>[0], apply: (sel: string) => void) => {
    try {
      const sel = await open(opts);
      if (typeof sel === "string" && sel) apply(sel.replaceAll("\\\\", "/").replaceAll("\\", "/"));
    } catch (e) {
      console.error(e);
      alert(`选择器打开失败：${String(e)}`);
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-ink">设置</h1>
      <p className="mt-2 text-xs leading-5 text-ink-2">
        当前为 FreeTube 模式：数据走 YouTube 网页端 InnerTube 接口与频道 RSS，无配额限制，
        无需 API Key 和任何 Google 登录；订阅频道在下方管理，数据只存本机。
      </p>

      <hr className="my-6 border-accent/80" />

      <GroupTitle>订阅</GroupTitle>
      <FieldTitle>订阅频道管理</FieldTitle>
      <FieldDesc>
        订阅基于本地频道列表（逐频道拉取 RSS，无需登录）。「订阅」页展示这些频道的最新视频聚合流。
      </FieldDesc>
      <ChannelManager />

      <hr className="my-6 border-accent/80" />

      <GroupTitle>视频下载</GroupTitle>

      <div className="mt-3">
        <FieldTitle>下载目录</FieldTitle>
        <FieldDesc>
          离线视频（mp4）的保存位置，默认 {DEFAULT_DOWNLOAD_DIR}；修改后即时生效，已完成的视频仍需在原目录下才会展示。
        </FieldDesc>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={settings.downloadDir}
            readOnly
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm text-ink-2 outline-none"
          />
          <button
            type="button"
            onClick={() => {
              void pickPath({ directory: true, multiple: false, defaultPath: settings.downloadDir }, (sel) =>
                settings.setDownloadDir(sel),
              );
            }}
            className="shrink-0 rounded-full bg-flat px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-flat-strong hover:text-ink"
          >
            选择文件夹
          </button>
          <button
            type="button"
            onClick={() => settings.setDownloadDir(DEFAULT_DOWNLOAD_DIR)}
            title="恢复默认目录"
            className="shrink-0 rounded-full bg-flat px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-flat-strong hover:text-ink"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </div>

      <div className="mt-5">
        <FieldTitle>默认清晰度</FieldTitle>
        <FieldDesc>下载弹窗的预选档位；「自动」为可用的最高清晰度（4K 为 vp9 编码，兼容性略差）。</FieldDesc>
        <GlassChipGroup
          className="mt-3"
          options={DOWNLOAD_QUALITIES.map(([value, label]) => ({ value, label }))}
          value={settings.defaultQuality}
          onChange={settings.setDefaultQuality}
        />
      </div>

      <div className="mt-5">
        <FieldTitle>ffmpeg 路径（可选）</FieldTitle>
        <FieldDesc>
          1080p 及以上为音视频分离流，需 ffmpeg 合流为 mp4。留空时首次使用会经代理自动下载到应用数据目录（约 35MB）；
          也可指定本地已有的 ffmpeg.exe。
        </FieldDesc>
        <div className="mt-2 flex items-center gap-2">
          <input
            value={settings.ffmpegPath}
            onChange={(e) => setFfmpegInput(e.target.value)}
            onBlur={() => settings.setFfmpegPath(ffmpegInput.trim())}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder="留空 = 自动管理"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink-3"
          />
          <button
            type="button"
            onClick={() => {
              void pickPath(
                { multiple: false, filters: [{ name: "ffmpeg", extensions: ["exe"] }] },
                (sel) => {
                  setFfmpegInput(sel);
                  settings.setFfmpegPath(sel);
                },
              );
            }}
            className="shrink-0 rounded-full bg-flat px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-flat-strong hover:text-ink"
          >
            选择文件
          </button>
        </div>
      </div>

      <hr className="my-6 border-accent/80" />

      <GroupTitle>通用</GroupTitle>

      <div className="mt-3">
        <FieldTitle>搜索内容语言</FieldTitle>
        <FieldDesc>影响搜索结果的偏好语言与元数据本地化（InnerTube context.hl），单选即生效。</FieldDesc>
        <GlassChipGroup
          className="mt-3"
          options={CONTENT_LANGS.map(([value, label]) => ({ value, label }))}
          value={langs[0] ?? ""}
          onChange={toggleLang}
        />
      </div>

      <div className="mt-5">
        <FieldTitle>请求代理（桌面端）</FieldTitle>
        <FieldDesc>
          国内直连 youtube 不可达，请求默认走本地代理。支持 host:port 或完整 http(s) URL，失焦即保存。
          API 与图片请求即时生效；视频播放 iframe 走 WebView 代理，修改后需重启应用生效。
        </FieldDesc>
        <input
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          onBlur={commitProxy}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder={DEFAULT_PROXY}
          spellCheck={false}
          className="mt-3 w-full rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink-3"
        />
        <button
          type="button"
          onClick={() => {
            setProxy(DEFAULT_PROXY);
            settings.setProxy(DEFAULT_PROXY);
            if (isTauri()) void invoke("save_webview_proxy", { proxy: DEFAULT_PROXY }).catch(() => {});
          }}
          className="mt-2 rounded-full bg-flat px-3 py-1 text-xs text-ink-2 hover:bg-flat-strong hover:text-ink"
        >
          恢复默认（{DEFAULT_PROXY}）
        </button>
      </div>

      <hr className="my-6 border-accent/80" />

      <GroupTitle>关于</GroupTitle>
      <div className="mt-1 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <FieldTitle>项目仓库</FieldTitle>
          <FieldDesc>
            GitHub 开源仓库（版本发布与问题反馈）：{REPO_URL.replace("https://", "")}
          </FieldDesc>
        </div>
        <button
          type="button"
          onClick={() => void openExternal(REPO_URL)}
          title="在系统浏览器中打开仓库"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-flat px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-flat-strong hover:text-ink"
        >
          查看
          <Icon name="openInNew" size={13} />
        </button>
      </div>
    </div>
  );
}
