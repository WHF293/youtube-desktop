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

/**
 * 设置页：API Key / 代理 / OAuth token / 地区。
 * 默认整体置灰只读，点「编辑」进入可编辑模式，保存（或取消）后恢复置灰。
 */
export default function Settings() {
  const settings = useSettings();
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [token, setToken] = useState(settings.accessToken);
  const [proxy, setProxy] = useState(settings.proxy);
  const [region, setRegion] = useState(settings.regionCode);
  const [langs, setLangs] = useState<string[]>(settings.languages);
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
    setProxy(settings.proxy);
    setRegion(settings.regionCode);
    setLangs(settings.languages);
    setTestResult(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setTestResult(null);
    setEditing(false);
  };

  const save = () => {
    const p = proxy.trim();
    settings.setApiKey(apiKey.trim());
    settings.setAccessToken(token.trim());
    settings.setProxy(p);
    settings.setRegionCode(region);
    settings.setLanguages(langs);
    // 同步给 Rust 落盘，下次启动 WebView 按 --proxy-server 挂代理（视频 iframe 播放用）
    if (isTauri()) void invoke("save_webview_proxy", { proxy: p }).catch(() => {});
    setTestResult({ ok: true, msg: "已保存。代理修改后重启应用对视频播放生效。" });
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

      <p className="mt-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs leading-5 text-ink-2">
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

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">YouTube Data API v3 Key（必填）</h2>
        <p className="mt-1 text-xs leading-5 text-ink-2">
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
        </p>
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
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">网络代理（桌面端）</h2>
        <p className="mt-1 text-xs leading-5 text-ink-2">
          国内直连 googleapis 不可达，API 请求默认走本地代理。支持 host:port 或完整
          http(s) URL；清空则不走代理。API 与图片请求即时生效；视频播放 iframe
          走 WebView 代理，修改后需重启应用生效。
        </p>
        <input
          value={proxy}
          onChange={(e) => setProxy(e.target.value)}
          placeholder={DEFAULT_PROXY}
          spellCheck={false}
          disabled={!editing}
          className={`mt-3 w-full rounded-lg border border-line bg-app px-3 py-2 font-mono text-sm text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
        {editing && (
          <button
            type="button"
            onClick={() => setProxy(DEFAULT_PROXY)}
            className="mt-2 rounded-full bg-flat px-3 py-1 text-xs text-ink-2 hover:bg-flat-strong hover:text-ink"
          >
            恢复默认（{DEFAULT_PROXY}）
          </button>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">OAuth access token（可选）</h2>
        <p className="mt-1 text-xs leading-5 text-ink-2">
          用于「我的订阅」等只读功能。在{" "}
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
          勾选 YouTube Data API v3 权限自行换取，粘贴到这里即可。
        </p>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ya29.…"
          rows={3}
          spellCheck={false}
          disabled={!editing}
          className={`mt-3 w-full resize-y rounded-lg border border-line bg-app px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink-3 ${LOCKED_CLS}`}
        />
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">热门视频地区</h2>
        <p className="mt-1 text-xs text-ink-2">影响首页与热门页 mostPopular 的地区（regionCode）。</p>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          disabled={!editing}
          className={`mt-3 rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink outline-none ${LOCKED_CLS}`}
        >
          {REGIONS.map(([code, label]) => (
            <option key={code} value={code}>
              {label}（{code}）
            </option>
          ))}
        </select>
      </section>

      <section className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">搜索内容语言</h2>
        <p className="mt-1 text-xs leading-5 text-ink-2">
          多选，影响搜索结果的偏好语言（relevanceLanguage）与元数据本地化（hl）。
          每多选一种语言，一次搜索多消耗 100 配额单位。
        </p>
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
                  on ? "bg-accent text-white" : "bg-flat text-ink-2 hover:bg-flat-strong hover:text-ink"
                } ${LOCKED_CLS}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

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
    </div>
  );
}
