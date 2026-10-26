import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChannels } from "../stores/channels";
import { resolveChannelInput } from "../lib/innertube";
import { errorMessage } from "../stores/videos";
import Icon from "../components/Icon";

/** FreeTube 模式的订阅频道管理：添加（链接/ID 自动解析）、Takeout CSV 导入、删除。
 *  博主列表默认收起，标题点击跳转「订阅」页 */
export default function ChannelManager() {
  const { channels, groups, add, remove, importTakeout } = useChannels();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [csv, setCsv] = useState("");

  const commitAdd = async () => {
    const raw = input.trim();
    if (!raw || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { id, title } = await resolveChannelInput(raw);
      add(id, title);
      setInput("");
      setMsg({ ok: true, text: `已添加「${title}」` });
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const commitImport = (csvText: string, source: string) => {
    if (!csvText.trim()) return;
    const n = importTakeout(csvText);
    setCsv("");
    setMsg({
      ok: n > 0,
      text:
        n > 0
          ? `已从${source}导入 ${n} 个频道`
          : `没有从${source}解析到新频道（需为 Takeout 的 subscriptions.csv，含 Channel Id 列）`,
    });
  };

  /** 文件选择导入（FreeTube 同款）：直接读 subscriptions.csv */
  const onPickFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => commitImport(String(reader.result ?? ""), `文件「${file.name}」`);
    reader.readAsText(file);
  };

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">订阅频道（{channels.length}）</span>
        <span className="text-xs text-ink-3">数据只存本机，无需登录 Google</span>
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitAdd();
          }}
          placeholder="频道链接（youtube.com/@xxx）或 UC 开头的频道 ID"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-lg border border-line bg-app px-3 py-2 text-sm text-ink outline-none focus:border-ink-3"
        />
        <button
          type="button"
          onClick={() => void commitAdd()}
          disabled={busy || !input.trim()}
          className="shrink-0 rounded-full bg-flat px-4 py-1.5 text-sm text-ink hover:bg-flat-strong disabled:opacity-50"
        >
          {busy ? "解析中…" : "添加"}
        </button>
      </div>

      <div className="mt-3 text-xs text-ink-2">
        <p className="font-medium text-ink-2">批量导入：Google Takeout 的 subscriptions.csv</p>
        <p className="mt-1 leading-5">
          在 takeout.google.com 只勾选「YouTube 和 YouTube Music」→ 订阅，导出后选择
          subscriptions.csv 文件导入（与 FreeTube 的导入格式一致）：
        </p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                onPickFile(e.target.files?.[0]);
                e.target.value = ""; // 允许重复选择同一文件
              }}
              className="mt-2 block w-full cursor-pointer rounded-lg border border-line bg-app px-3 py-2 text-xs text-ink file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-flat file:px-3 file:py-1 file:text-xs file:text-ink hover:file:bg-flat-strong"
            />
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={3}
              spellCheck={false}
              placeholder="或直接粘贴 CSV 内容：Channel Id,Channel Url,Channel Title…"
              className="mt-2 w-full resize-y rounded-lg border border-line bg-app px-3 py-2 font-mono text-xs text-ink outline-none focus:border-ink-3"
            />
        <button
          type="button"
          onClick={() => commitImport(csv, "粘贴内容")}
          disabled={!csv.trim()}
          className="mt-2 rounded-full bg-flat px-3 py-1 text-xs text-ink hover:bg-flat-strong disabled:opacity-50"
        >
          导入粘贴内容
        </button>
      </div>

      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-ink-2" : "text-accent"}`}>{msg.text}</p>}

      {/* 博主列表：默认收起；标题文字点击跳转「博主分组」看板，chevron 负责展开/收起 */}
      <div className="mt-3 flex w-full items-center gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "收起博主列表" : "展开博主列表"}
          className="rounded p-0.5 text-ink-3 transition-colors hover:bg-flat hover:text-ink"
        >
          <Icon name="chevronRight" size={14} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <button
          type="button"
          onClick={() => navigate("/groups")}
          title="打开博主分组看板，整理分组 →"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium text-ink hover:text-accent"
        >
          博主列表（{channels.length}）
          <Icon name="openInNew" size={12} className="shrink-0 text-ink-3" />
        </button>
      </div>
      {open && (
        <ul className="mt-1 max-h-80 divide-y divide-line overflow-y-auto">
          {channels.map((c) => {
            const groupName = groups.find((g) => g.id === c.groupId)?.name;
            return (
              <li key={c.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{c.title}</p>
                  <p className="truncate font-mono text-xs text-ink-3">
                    {c.id}
                    {groupName && <span className="ml-2 font-sans text-accent/80">{groupName}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label={`删除 ${c.title}`}
                  className="shrink-0 rounded-full px-2 py-1 text-xs text-ink-3 hover:bg-flat hover:text-accent"
                >
                  删除
                </button>
              </li>
            );
          })}
          {channels.length === 0 && (
            <li className="py-2 text-xs text-ink-3">还没有订阅频道，添加后可在「订阅」页查看更新。</li>
          )}
        </ul>
      )}
    </div>
  );
}
