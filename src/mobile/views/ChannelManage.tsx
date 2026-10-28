import { useEffect, useState } from "react";
import {
  useChannels,
  type SubChannel,
} from "../../common/stores/channels";
import { errorMessage } from "../../common/stores/videos";
import { resolveChannelInput } from "../../common/lib/innertube";
import { refreshChannelsMeta } from "../../common/stores/subsFeed";
import Img from "../../common/components/Img";
import BottomSheet from "../components/BottomSheet";
import { EmptyState } from "../components/StateViews";

/** 移动端订阅博主管理页（订阅页 navbar「管理」入口）：
 *  添加频道 / 改分组 / 删除（二次确认 3 秒复位）。导入导出 JSON 在「我的」页订阅管理 sheet */
export default function ChannelManageView() {
  const channels = useChannels((s) => s.channels);
  const groups = useChannels((s) => s.groups);
  const addChannel = useChannels((s) => s.add);
  const removeChannel = useChannels((s) => s.remove);
  const moveChannel = useChannels((s) => s.moveChannel);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 分组选择 sheet 的目标博主
  const [pickFor, setPickFor] = useState<SubChannel | null>(null);
  // 删除二次确认（3 秒无操作自动复位）
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  const commitAdd = async () => {
    const raw = input.trim();
    if (!raw || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { id, title } = await resolveChannelInput(raw);
      addChannel(id, title);
      setInput("");
      setMsg({ ok: true, text: `已添加「${title}」` });
      void refreshChannelsMeta();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const groupOf = (c: SubChannel) => groups.find((g) => g.id === c.groupId)?.name;

  return (
    <div className="m-page">
      {/* 添加频道 */}
      <div className="mx-3.5 mt-3.5 rounded-2xl bg-surface p-3.5 shadow-island">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
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
          disabled={busy || !input.trim()}
          className="mt-2 w-full rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "解析中…" : "添加频道"}
        </button>
        {msg && <p className={`mt-2 text-[11.5px] ${msg.ok ? "text-ink-2" : "text-red-500"}`}>{msg.text}</p>}
      </div>

      {/* 博主列表：改分组 / 删除 */}
      <div className="mx-3.5 mt-2.5 mb-4 overflow-hidden rounded-2xl bg-surface shadow-island">
        {channels.length === 0 ? (
          <EmptyState illust="▤" title="还没有订阅博主" desc="用上方输入框添加，或在观看页点「添加订阅」" />
        ) : (
          channels.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}>
              {c.thumb ? (
                <Img src={c.thumb} alt="" className="h-10 w-10 shrink-0 rounded-full bg-flat object-cover" />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-flat text-[15px] font-bold text-ink-2">
                  {c.title.slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-semibold text-ink">{c.title}</p>
                <button
                  type="button"
                  onClick={() => setPickFor(c)}
                  className="mt-0.5 block text-[11px] text-accent"
                >
                  {groupOf(c) ? `分组：${groupOf(c)}` : "未分组 · 点击设置"}
                </button>
              </div>
              {confirmId === c.id ? (
                <button
                  type="button"
                  onClick={() => {
                    removeChannel(c.id);
                    setConfirmId(null);
                  }}
                  className="shrink-0 rounded-full bg-red-500 px-3 py-1.5 text-[11.5px] font-bold text-white"
                >
                  确认删除
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmId(c.id)}
                  className="shrink-0 rounded-full px-3 py-1.5 text-[11.5px] text-ink-3 active:bg-flat"
                >
                  删除
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* 分组选择 sheet */}
      <BottomSheet open={pickFor !== null} onClose={() => setPickFor(null)} title={`「${pickFor?.title ?? ""}」分组`}>
        <div className="mb-2 grid grid-cols-2 gap-2">
          {[{ id: undefined, name: "未分组" }, ...groups].map((g) => (
            <button
              key={g.id ?? "none"}
              type="button"
              onClick={() => {
                if (pickFor) moveChannel(pickFor.id, g.id);
                setPickFor(null);
              }}
              className={`rounded-xl px-2 py-2.5 text-[12.5px] font-medium ${
                pickFor?.groupId === g.id ? "bg-accent text-white" : "bg-flat text-ink"
              }`}
            >
              {g.name}
            </button>
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
