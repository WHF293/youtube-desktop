import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSettings, DEFAULT_PROXY, CONTENT_LANGS } from "../stores/settings";
import ChannelManager from "./ChannelManager";

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
