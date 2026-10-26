import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { useSettings, DEFAULT_PROXY, CONTENT_LANGS } from "../stores/settings";
import { ytApi } from "../lib/youtube";
import { errorMessage } from "../stores/videos";
import { openExternal } from "../lib/open";

const REGIONS = [
  ["US", "美国"],
  ["CN", "中国"],
  ["HK", "中国香港"],
  ["TW", "中国台湾"],
  ["JP", "日本"],
  ["KR", "韩国"],
  ["GB", "英国"],
  ["SG", "新加坡"],
] as const;

/** 输入框置灰态：disabled + 半透明，与可编辑态区分 */
const LOCKED_CLS = "disabled:cursor-not-allowed disabled:opacity-50";

/** 横线风格分组：组标题 + 紧凑条目，两大组之间用横线分隔 */
function GroupTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-xs font-medium tracking-wide text-ink-3 uppercase">{children}</h2>
  );
}

function FieldTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-ink">{children}</h2>;
}

function FieldDesc({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs leading-5 text-ink-2">{children}</p>;
}

/**
 * 设置页，两组：
 * - 「API Key / OAuth token / 搜索内容语言」：默认置灰，点「编辑」进入可编辑，保存/取消后恢复；
 * - 「请求代理 / 热门视频地区」：直接修改、即时生效，不受编辑门控。
 */
export default function Settings() {
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [token, setToken] = useState(settings.accessToken);
  const [refreshToken, setRefreshToken] = useState(settings.refreshToken);
  const [clientId, setClientId] = useState(settings.oauthClientId);
  const [clientSecret, setClientSecret] = useState(settings.oauthClientSecret);
  const [langs, setLangs] = useState<string[]>(settings.languages);
  const [proxy, setProxy] = useState(settings.proxy);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const toggleLang = (code: string) => {
    setLangs((prev) =>
      prev.includes(code)
        ? prev.length > 1
          ? prev.filter((c) => c !== code) // 至少保留一个语言
          : prev
        : [...prev, code],
    );
  };

  const startEdit = () => {
    // 以 store 当前值为准进入编辑（防止别处修改后本地 state 过期）
    setApiKey(settings.apiKey);
    setToken(settings.accessToken);
    setRefreshToken(settings.refreshToken);
    setClientId(settings.oauthClientId);
    setClientSecret(settings.oauthClientSecret);
    setLangs(settings.languages);
    setTestResult(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setTestResult(null);
    setEditing(false);
  };

  const save = () => {
    settings.setApiKey(apiKey.trim());
    settings.setAccessToken(token.trim());
    settings.setRefreshToken(refreshToken.trim());
    settings.setOauthClientId(clientId.trim());
    settings.setOauthClientSecret(clientSecret.trim());
    settings.setLanguages(langs);
    setTestResult({ ok: true, msg: "已保存。" });
    setEditing(false);
  };

  const testKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      setTestResult({ ok: false, msg: "请先填写 API Key" });
      return;
    }
    settings.setApiKey(key);
    setTesting(true);
    setTestResult(null);
    try {
      await ytApi.ping();
      setTestResult({ ok: true, msg: "连通成功，API Key 有效。" });
    } catch (e) {
      setTestResult({ ok: false, msg: `连通失败：${errorMessage(e)}` });
    } finally {
      setTesting(false);
    }
  };

  /** 代理输入框失焦 / 回车即保存（API 与图片请求即时生效） */
  const commitProxy = () => {
    const p = proxy.trim();
    settings.setProxy(p);
    if (isTauri()) void invoke("save_webview_proxy", { proxy: p }).catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">设置</h1>
        {!editing && (
          <button
            type="button"
            onClick={startEdit}
            className="rounded-full bg-flat px-4 py-1.5 text-sm text-ink hover:bg-flat-strong"
          >
            编辑
          </button>
        )}
      </div>

      <p className="mt-2 text-xs leading-5 text-ink-2">
        还没有 API Key？参考图文教程：{" "}
        <a
          href="https://cloud.tencent.com/developer/article/2414978"
          onClick={(e) => {
            e.preventDefault();
            void openExternal("https://cloud.tencent.com/developer/article/2414978");
          }}
          className="text-accent underline"
        >
          手把手教你开通 YouTube 官方 API 接口（YouTube Data API v3）
        </a>
      </p>

      {/* ——— 第一组：需点「编辑」才能修改 ——— */}
      <GroupTitle>需编辑后修改</GroupTitle>

      <div className="mt-3">
        <FieldTitle>YouTube Data API v3 Key（必填）</FieldTitle>
        <FieldDesc>
          在{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            onClick={(e) => {
              e.preventDefault();
              void openExternal("https://console.cloud.google.com/apis/credentials");
            }}
            className="text-accent underline"
          >
            Google Cloud Console
          </a>{" "}
          创建 API Key 并启用 YouTube Data API v3。Key 只存在本机（localStorage），不经过任何第三方。
        </FieldDesc>
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza…"
          spellCheck={false}
          disabled={!editing}
          className={`mt-3 w-full rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
        {editing && (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void testKey()}
              disabled={testing}
              className="rounded-full bg-flat px-4 py-1.5 text-sm text-ink hover:bg-flat-strong disabled:opacity-50"
            >
              {testing ? "测试中…" : "测试连通"}
            </button>
            {testResult && (
              <span className={`text-xs ${testResult.ok ? "text-ink-2" : "text-accent"}`}>
                {testResult.msg}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-5">
        <FieldTitle>OAuth access token（可选，用于「我的订阅」）</FieldTitle>
        <FieldDesc>
          token 约 1 小时过期。在{" "}
          <a
            href="https://developers.google.com/oauthplayground/"
            onClick={(e) => {
              e.preventDefault();
              void openExternal("https://developers.google.com/oauthplayground/");
            }}
            className="text-accent underline"
          >
            OAuth Playground
          </a>{" "}
          点右上角齿轮 → 勾选「Use your own OAuth credentials」填入下方 client_id / secret，
          Scope 填 https://www.googleapis.com/auth/youtube.readonly，Authorize 前勾选
          「Force approval prompt」（否则不发 refresh token），Exchange 后把 access_token、
          refresh_token 一并粘贴到下面。配置 refresh token 后应用会自动续期，无需再手动更换。
        </FieldDesc>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="access_token（ya29.…，也可留空由 refresh token 自动获取）"
          rows={2}
          spellCheck={false}
          disabled={!editing}
          className={`mt-3 w-full resize-y rounded-lg border border-line bg-app px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
        <input
          value={refreshToken}
          onChange={(e) => setRefreshToken(e.target.value)}
          placeholder="refresh_token（1//…，长期有效，配置后自动续期）"
          spellCheck={false}
          disabled={!editing}
          className={`mt-2 w-full rounded-lg border border-line bg-app px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
        <input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="client_id（…apps.googleusercontent.com）"
          spellCheck={false}
          disabled={!editing}
          className={`mt-2 w-full rounded-lg border border-line bg-app px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
        <input
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          placeholder="client_secret（GOCSPX-…）"
          type="password"
          spellCheck={false}
          disabled={!editing}
          className={`mt-2 w-full rounded-lg border border-line bg-app px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
      </div>

      <div className="mt-5">
        <FieldTitle>搜索内容语言</FieldTitle>
        <FieldDesc>
          多选，影响搜索结果的偏好语言（relevanceLanguage）与元数据本地化（hl）。
          每多选一种语言，一次搜索多消耗 100 配额单位。
        </FieldDesc>
        <div className={`mt-3 flex flex-wrap gap-2 ${editing ? "" : "opacity-50"}`}>
          {CONTENT_LANGS.map(([code, label]) => {
            const on = langs.includes(code);
            return (
              <button
                key={code}
                type="button"
                disabled={!editing}
                onClick={() => toggleLang(code)}
                aria-pressed={on}
                className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                  on
                    ? "bg-accent text-white"
                    : "bg-flat text-ink-2 hover:bg-flat-strong hover:text-ink"
                } ${LOCKED_CLS}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 编辑组操作按钮 */}
      {editing && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            保存
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-full bg-flat px-4 py-1.5 text-sm text-ink hover:bg-flat-strong"
          >
            取消
          </button>
        </div>
      )}

      {/* ——— 组分隔横线 ——— */}
      <hr className="my-6 border-line" />

      {/* ——— 第二组：直接修改、即时生效 ——— */}
      <GroupTitle>直接生效</GroupTitle>

      <div className="mt-3">
        <FieldTitle>请求代理（桌面端）</FieldTitle>
        <FieldDesc>
          国内直连 googleapis 不可达，API 请求默认走本地代理。支持 host:port 或完整
          http(s) URL，失焦即保存。API 与图片请求即时生效；视频播放 iframe
          走 WebView 代理，修改后需重启应用生效。
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

      <div className="mt-5">
        <FieldTitle>热门视频地区</FieldTitle>
        <FieldDesc>影响首页与热门页 mostPopular 的地区（regionCode），选择即生效。</FieldDesc>
        <select
          value={settings.regionCode}
          onChange={(e) => settings.setRegionCode(e.target.value)}
          className="mt-3 rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink outline-none"
        >
          {REGIONS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}（{code}）
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
