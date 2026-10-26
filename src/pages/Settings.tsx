import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettings, DEFAULT_PROXY, CONTENT_LANGS, DEFAULT_DOWNLOAD_DIR, DOWNLOAD_QUALITIES } from "../stores/settings";
import ChannelManager from "./ChannelManager";
import Icon from "../components/Icon";

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
  const [langs, setLangs] = useState<string[]>(settings.languages);
  const [proxy, setProxy] = useState(settings.proxy);
  const [ffmpegInput, setFfmpegInput] = useState(settings.ffmpegPath);

  const toggleLang = (code: string) => {
    setLangs((prev) => {
      const next = prev.includes(code)
        ? prev.length > 1
          ? prev.filter((c) => c !== code) // 至少保留一个语言
          : prev
        : [...prev, code];
      settings.setLanguages(next);
      return next;
    });
  };

  /** 代理输入框失焦 / 回车即保存（API 与图片请求即时生效） */
  const commitProxy = () => {
    const p = proxy.trim();
    settings.setProxy(p);
    if (isTauri()) void invoke("save_webview_proxy", { proxy: p }).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-lg font-semibold text-ink">设置</h1>
      <p className="mt-2 text-xs leading-5 text-ink-2">
        当前为 FreeTube 模式：数据走 YouTube 网页端 InnerTube 接口与频道 RSS，无配额限制，
        无需 API Key 和任何 Google 登录；订阅频道在下方管理，数据只存本机。
      </p>

      <hr className="my-6 border-line" />

      <GroupTitle>订阅</GroupTitle>
      <FieldTitle>订阅频道管理</FieldTitle>
      <FieldDesc>
        订阅基于本地频道列表（逐频道拉取 RSS，无需登录）。「订阅」页展示这些频道的最新视频聚合流。
      </FieldDesc>
      <ChannelManager />

      <hr className="my-6 border-line" />

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
              void open({ directory: true, multiple: false, defaultPath: settings.downloadDir }).then((sel) => {
                if (typeof sel === "string" && sel) settings.setDownloadDir(sel.replaceAll("\\\\", "/").replaceAll("\\", "/"));
              });
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
        <div className="mt-3 flex flex-wrap gap-2">
          {DOWNLOAD_QUALITIES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => settings.setDefaultQuality(value)}
              aria-pressed={settings.defaultQuality === value}
              className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                settings.defaultQuality === value
                  ? "bg-accent text-white"
                  : "bg-flat text-ink-2 hover:bg-flat-strong hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
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
              void open({
                multiple: false,
                filters: [{ name: "ffmpeg", extensions: ["exe"] }],
              }).then((sel) => {
                if (typeof sel === "string" && sel) {
                  const p = sel.replaceAll("\\\\", "/").replaceAll("\\", "/");
                  setFfmpegInput(p);
                  settings.setFfmpegPath(p);
                }
              });
            }}
            className="shrink-0 rounded-full bg-flat px-3 py-2 text-xs text-ink-2 transition-colors hover:bg-flat-strong hover:text-ink"
          >
            选择文件
          </button>
        </div>
      </div>

      <hr className="my-6 border-line" />

      <GroupTitle>通用</GroupTitle>

      <div className="mt-3">
        <FieldTitle>搜索内容语言</FieldTitle>
        <FieldDesc>多选，影响搜索结果的偏好语言与元数据本地化（InnerTube context.hl），选择即生效。</FieldDesc>
        <div className="mt-3 flex flex-wrap gap-2">
          {CONTENT_LANGS.map(([code, label]) => {
            const on = langs.includes(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleLang(code)}
                aria-pressed={on}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  on ? "bg-accent text-white" : "bg-flat text-ink-2 hover:bg-flat-strong hover:text-ink"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
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
    </div>
  );
}
