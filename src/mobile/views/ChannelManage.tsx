import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  useChannels,
  type SubChannel,
} from "../../common/stores/channels";
import { errorMessage } from "../../common/stores/videos";
import { resolveChannelInput } from "../../common/lib/innertube";
import { refreshChannelsMeta } from "../../common/stores/subsFeed";
import Img from "../../common/components/Img";
import Icon from "../../common/components/Icon";
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
  const renameGroup = useChannels((s) => s.renameGroup);
  const addGroup = useChannels((s) => s.addGroup);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // 添加频道弹层（navbar 加号唤起）/ 新建分组弹层（右下角固钉唤起）
  const [addOpen, setAddOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  // 分组选择 sheet 的目标博主
  const [pickFor, setPickFor] = useState<SubChannel | null>(null);
  // 删除二次确认（3 秒无操作自动复位）
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // 分组区块展开状态（默认全开，key "ungrouped" = 默认分组）
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  // 分组改名 sheet 的目标分组（null 且 renameOpen 才是默认分组的提示；仅自定义分组可改名）
  const [renameFor, setRenameFor] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  useEffect(() => {
    if (!confirmId) return;
    const t = window.setTimeout(() => setConfirmId(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirmId]);

  // navbar 加号按钮在 MobileApp 内，经自定义事件唤起添加弹层
  useEffect(() => {
    const open = () => setAddOpen(true);
    window.addEventListener("m-manage-add", open);
    return () => window.removeEventListener("m-manage-add", open);
  }, []);

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
      setAddOpen(false);
      void refreshChannelsMeta();
    } catch (e) {
      setMsg({ ok: false, text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  const commitAddGroup = () => {
    const name = groupName.trim();
    if (!name) return;
    addGroup(name);
    setGroupName("");
    setGroupOpen(false);
    setMsg({ ok: true, text: `已新建分组「${name}」` });
  };

  const groupOf = (c: SubChannel) => groups.find((g) => g.id === c.groupId)?.name;

  // 分组区块：默认分组固定第一，自定义分组按用户排序跟在后面（空的自定义组保留）。
  // 与 PC 订阅页右栏的 sections 结构保持一致
  const sections: { key: string; name: string; groupId?: string; list: SubChannel[] }[] = [
    { key: "ungrouped", name: "默认分组", groupId: undefined, list: channels.filter((c) => !c.groupId) },
    ...groups.map((g) => ({
      key: g.id,
      name: g.name,
      groupId: g.id,
      list: channels.filter((c) => c.groupId === g.id),
    })),
  ].filter((s) => s.groupId !== undefined || s.list.length > 0);

  /** 博主条目（改分组 / 删除）；头像+名称点击进博主主页 */
  const channelRow = (c: SubChannel, first: boolean) => (
    <div key={c.id} className={`flex items-center gap-3 px-3.5 py-2.5 ${first ? "" : "border-t border-line"}`}>
      <Link to={`/channel/${c.id}`} aria-label={`前往 ${c.title} 主页`} className="shrink-0 active:opacity-70">
        {c.thumb ? (
          <Img src={c.thumb} alt="" className="h-10 w-10 rounded-full bg-flat object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-flat text-[15px] font-bold text-ink-2">
            {c.title.slice(0, 1).toUpperCase()}
          </span>
        )}
      </Link>
      <div className="min-w-0 flex-1">
        <Link to={`/channel/${c.id}`} className="mt-0 block truncate text-[13.5px] font-semibold text-ink">
          {c.title}
        </Link>
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
  );

  return (
    <div className="m-page">
      {/* 操作结果提示（添加频道/新建分组） */}
      {msg && <p className={`mx-3.5 mt-3 text-[11.5px] ${msg.ok ? "text-ink-2" : "text-red-500"}`}>{msg.text}</p>}

      {/* 博主列表：每个分组一个圆角卡片（分组名 + 博主列表整体包裹），分组之间留间隔。
          交互不变：区块可展开/收起，自定义分组支持改名 */}
      <div className="mx-3.5 mt-2.5 mb-4 flex flex-col gap-3">
        {channels.length === 0 ? (
          <div className="overflow-hidden rounded-2xl bg-surface shadow-island">
            <EmptyState illust="▤" title="还没有订阅博主" desc="点右上角 + 添加，或在观看页点「添加订阅」" />
          </div>
        ) : (
          sections.map((s) => {
            const open = !closedSections[s.key];
            return (
              <div key={s.key} className="overflow-hidden rounded-2xl bg-surface shadow-island">
                {/* 区块头：展开/收起 + 计数 + 改名（仅自定义分组） */}
                <div className="flex items-center gap-1 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => setClosedSections((m) => ({ ...m, [s.key]: !m[s.key] }))}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-left"
                  >
                    <Icon
                      name="chevronRight"
                      size={12}
                      className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                    />
                    <span className="truncate text-[12.5px] font-semibold text-ink-2">{s.name}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-3">（{s.list.length}）</span>
                  </button>
                  {s.groupId !== undefined && (
                    <button
                      type="button"
                      onClick={() => {
                        setRenameFor(s.groupId!);
                        setRenameInput(s.name);
                      }}
                      aria-label={`重命名分组 ${s.name}`}
                      className="shrink-0 rounded-full p-1.5 text-ink-3 active:bg-flat"
                    >
                      <Icon name="edit" size={13} />
                    </button>
                  )}
                </div>
                {/* 区块内博主：grid-rows 高度过渡（PC 右栏同款） */}
                <div
                  className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="min-h-0 overflow-hidden">
                    {s.list.length > 0 ? (
                      s.list.map((c, i) => channelRow(c, i === 0))
                    ) : (
                      <p className="px-3.5 pb-2.5 text-[11.5px] text-ink-3">空分组 · 在列表中点博主分组名移入</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
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

      {/* 新建分组固钉：悬浮在 TabBar 上方（m-body 底部已让位 76px + 安全区），大屏无 TabBar 也不碍事 */}
      <button
        type="button"
        aria-label="新建分组"
        onClick={() => setGroupOpen(true)}
        className="fixed right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-island active:opacity-80"
        style={{ bottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
      >
        <Icon name="library" size={20} />
      </button>

      {/* 添加频道弹层（navbar 加号唤起） */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title="添加频道">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commitAdd();
          }}
          placeholder="频道链接（youtube.com/@xxx）或 UC 开头的频道 ID"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-xl bg-flat px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        {msg && !msg.ok && <p className="mt-2 text-[11.5px] text-red-500">{msg.text}</p>}
        <button
          type="button"
          onClick={() => void commitAdd()}
          disabled={busy || !input.trim()}
          className="mt-2 w-full rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "解析中…" : "确认添加"}
        </button>
      </BottomSheet>

      {/* 新建分组弹层 */}
      <BottomSheet open={groupOpen} onClose={() => setGroupOpen(false)} title="新建分组">
        <input
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitAddGroup();
          }}
          placeholder="分组名称"
          maxLength={20}
          className="w-full rounded-xl bg-flat px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          onClick={commitAddGroup}
          disabled={!groupName.trim()}
          className="mt-2 w-full rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          确认新建
        </button>
      </BottomSheet>

      {/* 分组改名 sheet（仅自定义分组） */}
      <BottomSheet open={renameFor !== null} onClose={() => setRenameFor(null)} title="重命名分组">
        <input
          type="text"
          value={renameInput}
          onChange={(e) => setRenameInput(e.target.value)}
          placeholder="分组名称"
          maxLength={20}
          autoFocus
          className="w-full rounded-xl bg-flat px-3.5 py-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          disabled={!renameInput.trim()}
          onClick={() => {
            if (renameFor && renameInput.trim()) renameGroup(renameFor, renameInput);
            setRenameFor(null);
          }}
          className="mt-2 w-full rounded-full bg-accent py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          保存
        </button>
      </BottomSheet>
    </div>
  );
}
