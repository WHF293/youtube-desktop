import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link, useNavigate } from "react-router-dom";
import { open, save } from "@tauri-apps/plugin-dialog";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useChannels, type SubChannel, buildChannelsExport } from "../stores/channels";
import { refreshChannelsMeta } from "../stores/subsFeed";
import { registerPageRefresh } from "../lib/refresh";
import Img from "../components/Img";
import Icon from "../components/Icon";

/**
 * 博主分组页（看板式）：一个分组一列，拖拽博主卡片到不同列即切换分组，
 * 列头可拖拽调整分组顺序。基于 dnd-kit（pointer events 自实现拖拽），
 * 不依赖 HTML5 原生 drag & drop（WebView2 下原生方案光标异常/事件不稳）。
 */

/** 博主卡片（可拖拽；点击进频道页——传感器 distance 约束区分点击与拖拽） */
function BloggerCard({
  c,
  onOpen,
}: {
  c: SubChannel;
  onOpen: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: c.id,
    data: { type: "channel" },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(c.id)}
      className={`flex cursor-grab touch-none items-center gap-2.5 rounded-xl border border-line bg-app p-2 transition-colors hover:bg-flat active:cursor-grabbing ${
        isDragging ? "opacity-30 ring-1 ring-accent" : ""
      }`}
    >
      {c.thumb ? (
        <Img src={c.thumb} alt="" className="h-8 w-8 shrink-0 rounded-full bg-flat object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flat text-xs font-medium text-ink-2">
          {c.title.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title}</span>
      <Icon name="arrowLeft" size={13} className="shrink-0 rotate-180 text-ink-3 opacity-30" />
    </div>
  );
}

/** 看板列 */
function GroupColumn({
  colKey,
  name,
  count,
  groupId,
  channelIds,
  isCustom,
  onDelete,
  onRequestDelete,
  confirmDelete,
  onMoveGroup,
  canMoveLeft,
  canMoveRight,
  children,
}: {
  colKey: string;
  name: string;
  count: number;
  groupId: string | undefined;
  channelIds: string[];
  isCustom: boolean;
  onDelete: () => void;
  onRequestDelete: () => void;
  confirmDelete: boolean;
  onMoveGroup: (dir: -1 | 1) => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  children: React.ReactNode;
}) {
  // 列本体是 drop 区（空列也能落）
  const { setNodeRef, isOver } = useDroppable({ id: `col:${colKey}`, data: { type: "column", groupId } });
  // 列头可拖拽排序（默认分组列固定，不可拖）
  const groupSort = useSortable({
    id: `group:${colKey}`,
    data: { type: "group", groupId },
    disabled: !isCustom,
  });

  return (
    <section
      ref={setNodeRef}
      className={`flex w-60 shrink-0 flex-col rounded-2xl bg-surface shadow-island transition-colors ${
        isOver ? "ring-2 ring-accent" : ""
      }`}
    >
      {/* 列头：拖拽排序把手 + 删除（二次确认在父级处理） */}
      <div
        ref={groupSort.setNodeRef}
        style={{ transform: CSS.Transform.toString(groupSort.transform), transition: groupSort.transition }}
        {...groupSort.attributes}
        {...groupSort.listeners}
        className={`flex shrink-0 items-center gap-1 px-3 pb-1 pt-3 ${isCustom ? "cursor-grab touch-none" : ""} ${
          groupSort.isDragging ? "opacity-30" : ""
        }`}
      >
        {isCustom && (
          <Icon name="grip" size={12} className="shrink-0 text-ink-3" />
        )}
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{name}</h2>
        <span className="shrink-0 text-xs tabular-nums text-ink-3">{count}</span>
        {isCustom && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveGroup(-1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!canMoveLeft}
              title="前移"
              aria-label={`前移分组 ${name}`}
              className="shrink-0 rounded p-0.5 text-ink-3 opacity-40 transition-opacity hover:text-ink hover:opacity-100 disabled:pointer-events-none disabled:opacity-20"
            >
              <Icon name="arrowLeft" size={12} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoveGroup(1);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              disabled={!canMoveRight}
              title="后移"
              aria-label={`后移分组 ${name}`}
              className="shrink-0 rounded p-0.5 text-ink-3 opacity-40 transition-opacity hover:text-ink hover:opacity-100 disabled:pointer-events-none disabled:opacity-20"
            >
              <Icon name="arrowLeft" size={12} className="rotate-180" />
            </button>
            {confirmDelete ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title="再次点击确认删除（博主将移回默认分组，不会删除博主）"
                className="shrink-0 rounded px-1 text-xs font-medium text-accent"
              >
                确认删除
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete();
                }}
                onPointerDown={(e) => e.stopPropagation()}
                title={`删除分组「${name}」（组内博主移回默认分组，不会删除博主）`}
                aria-label={`删除分组 ${name}`}
                className="shrink-0 rounded p-0.5 text-ink-3 opacity-40 transition-opacity hover:text-accent hover:opacity-100"
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </>
        )}
      </div>
      {/* 列体：博主卡片（dnd-kit 排序上下文，独立滚动） */}
      <SortableContext items={channelIds} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2 pt-1">{children}</div>
      </SortableContext>
    </section>
  );
}

export default function Groups() {
  const { channels, groups, moveChannel, addGroup, removeGroup, moveGroup, reorderChannel, reorderGroups } =
    useChannels();
  const navigate = useNavigate();
  // 删除分组二次确认（3 秒自动复位）
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  // 新建分组的内联输入
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    if (!confirmDeleteKey) return;
    const t = setTimeout(() => setConfirmDeleteKey(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteKey]);

  // 右下角刷新固钉：刷新博主远端元数据（头像/损坏标题自愈）
  useEffect(() => registerPageRefresh("/groups", () => void refreshChannelsMeta()), []);

  // ---------- 博主管理 JSON 导入/导出（跨设备同步） ----------
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState("");
  const [copied, setCopied] = useState(false);
  const { importJson } = useChannels();

  const buildExport = () => buildChannelsExport(channels, groups);

  const exportJson = async () => {
    try {
      const path = await save({
        defaultPath: "youtube-desktop-订阅备份.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!path) return;
      await invoke("write_text_file", { path, contents: buildExport() });
      alert(`已导出到：${path}`);
    } catch (e) {
      alert(`导出失败：${String(e)}`);
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(buildExport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert("复制到剪贴板失败，请改用「导出文件」");
    }
  };

  const pickImportFile = async () => {
    try {
      const sel = await open({ multiple: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (typeof sel === "string" && sel) {
        setImportText(await invoke<string>("read_text_file", { path: sel }));
        setImportResult("");
      }
    } catch (e) {
      setImportResult(`读取文件失败：${String(e)}`);
    }
  };

  const confirmImport = () => {
    try {
      const r = importJson(JSON.parse(importText));
      setImportResult(`已导入 ${r.imported} 位博主（跳过已有 ${r.skipped}），新增 ${r.groupsAdded} 个分组`);
      if (r.imported > 0 || r.groupsAdded > 0) {
        setTimeout(() => {
          setImportOpen(false);
          setImportText("");
          setImportResult("");
        }, 1200);
      }
    } catch (e) {
      setImportResult(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 列：默认分组固定第一列，自定义分组按用户排序跟在后面
  const columns: { key: string; name: string; groupId: string | undefined; list: SubChannel[] }[] = [
    { key: "ungrouped", name: "默认分组", groupId: undefined, list: channels.filter((c) => !c.groupId) },
    ...groups.map((g) => ({
      key: g.id,
      name: g.name,
      groupId: g.id as string | undefined,
      list: channels.filter((c) => c.groupId === g.id),
    })),
  ];

  const columnOfChannel = (channelId: string) =>
    columns.find((col) => col.list.some((c) => c.id === channelId));

  const columnByKey = (key: string) => columns.find((col) => col.key === key);

  const targetGroupIdFromOver = (overId: string): string | undefined | null => {
    if (overId.startsWith("col:")) return columnByKey(overId.slice(4))?.groupId ?? null;
    if (overId.startsWith("group:")) return columnByKey(overId.slice(6))?.groupId ?? null;
    return columnOfChannel(overId)?.groupId ?? null;
  };

  const onDragStart = (e: DragStartEvent) => setActiveDragId(String(e.active.id));

  // 跨列拖拽：悬停到别的分组时实时移动博主（store 即时更新，UI 跟随）
  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over || active.data.current?.type !== "channel") return;
    const activeId = String(active.id);
    const target = targetGroupIdFromOver(String(over.id));
    const from = columnOfChannel(activeId);
    if (target !== null && target !== undefined && from && from.groupId !== target) {
      moveChannel(activeId, target);
    }
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (overId === activeId) return;

    // 分组列头排序
    if (active.data.current?.type === "group" && overId.startsWith("group:")) {
      reorderGroups(activeId.slice(6), overId.slice(6));
      return;
    }
    // 博主卡片：同列内排序（跨列移动已在 dragOver 完成）
    if (active.data.current?.type === "channel" && !overId.startsWith("col:") && !overId.startsWith("group:")) {
      reorderChannel(activeId, overId);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveDragId(null)}
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-2.5">
        {/* 页头：标题 + 统计 + 新建分组 */}
        <header className="flex shrink-0 items-center gap-3 px-1">
          <h1 className="text-lg font-semibold text-ink">博主分组</h1>
          <p className="text-xs text-ink-3">
            {channels.length} 位博主 · 拖拽卡片到不同分组即完成归类，点击卡片进入频道页
          </p>
          <div className="ml-auto flex items-center gap-2">
            {creating ? (
              <input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) {
                    addGroup(newGroupName);
                    setNewGroupName("");
                    setCreating(false);
                  }
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewGroupName("");
                  }
                }}
                onBlur={() => {
                  if (newGroupName.trim()) addGroup(newGroupName);
                  setNewGroupName("");
                  setCreating(false);
                }}
                placeholder="分组名称，回车确认"
                className="w-56 rounded-lg border border-line bg-app px-3 py-1.5 text-sm text-ink outline-none focus:border-ink-3"
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex items-center gap-1 rounded-full glass-btn px-3 py-1.5 text-sm text-ink transition-colors hover:brightness-110"
              >
                <Icon name="plus" size={14} />
                新建分组
              </button>
            )}
            {/* 跨设备同步：JSON 导入/导出（合并语义，见弹窗说明） */}
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              title="从 JSON 导入博主与分组"
              className="rounded-full glass-btn px-3 py-1.5 text-sm text-ink transition-colors hover:brightness-110"
            >
              导入
            </button>
            <button
              type="button"
              onClick={() => void exportJson()}
              title="导出博主与分组为 JSON 文件"
              className="rounded-full glass-btn px-3 py-1.5 text-sm text-ink transition-colors hover:brightness-110"
            >
              导出文件
            </button>
            <button
              type="button"
              onClick={() => void copyJson()}
              title="复制博主与分组 JSON 到剪贴板"
              className="rounded-full glass-btn px-3 py-1.5 text-sm text-ink transition-colors hover:brightness-110"
            >
              {copied ? "已复制" : "复制 JSON"}
            </button>
          </div>
        </header>

        {/* 看板：横向滚动，一列一个分组，列内独立滚动 */}
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-1">
          {columns.map((col) => (
            <GroupColumn
              key={col.key}
              colKey={col.key}
              name={col.name}
              count={col.list.length}
              groupId={col.groupId}
              channelIds={col.list.map((c) => c.id)}
              isCustom={col.groupId !== undefined}
              confirmDelete={confirmDeleteKey === col.key}
              onDelete={() => {
                if (col.groupId) removeGroup(col.groupId);
                setConfirmDeleteKey(null);
              }}
              onRequestDelete={() => setConfirmDeleteKey(col.key)}
              onMoveGroup={(dir) => col.groupId && moveGroup(col.groupId, dir)}
              canMoveLeft={groups[0]?.id !== col.groupId}
              canMoveRight={groups[groups.length - 1]?.id !== col.groupId}
            >
              {col.list.map((c) => (
                <BloggerCard key={c.id} c={c} onOpen={(id) => navigate(`/channel/${id}`)} />
              ))}
              {col.list.length === 0 && (
                <p className="rounded-xl border border-dashed border-line px-2 py-6 text-center text-xs leading-5 text-ink-3">
                  空分组
                  <br />
                  拖拽博主卡片到这里
                </p>
              )}
            </GroupColumn>
          ))}

          {/* 无博主的引导 */}
          {channels.length === 0 && (
            <div className="m-auto rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-2">
              <p className="font-medium text-ink">还没有订阅博主</p>
              <p className="mt-2 leading-6">
                到 <Link to="/settings" className="text-accent underline">设置页</Link> 添加频道（粘贴频道链接或
                ID），或导入 Google Takeout 的 subscriptions.csv，然后回到这里分组管理。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 拖拽跟随影子 */}
      <DragOverlay>
        {activeDragId && !activeDragId.startsWith("group:") ? (
          (() => {
            const c = channels.find((x) => x.id === activeDragId);
            if (!c) return null;
            return (
              <div className="flex w-56 items-center gap-2.5 rounded-xl border border-accent bg-app p-2 shadow-island">
                {c.thumb ? (
                  <Img src={c.thumb} alt="" className="h-8 w-8 shrink-0 rounded-full bg-flat object-cover" />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flat text-xs font-medium text-ink-2">
                    {c.title.slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title}</span>
              </div>
            );
          })()
        ) : null}
      </DragOverlay>

      {/* JSON 导入弹窗（合并导入：已有博主跳过，同名分组复用） */}
      {importOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50" onClick={() => setImportOpen(false)} aria-hidden="true" />
          <div className="relative flex w-full max-w-md flex-col rounded-2xl border border-line bg-surface p-4 shadow-island">
            <h3 className="text-sm font-semibold text-ink">导入博主与分组（JSON）</h3>
            <p className="mt-1 text-xs leading-5 text-ink-3">
              合并导入：已存在的博主跳过（保留本地分组归属），同名分组复用本地分组，其余按导出时的分组归属还原。
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder="粘贴此前导出的 JSON，或点「选择文件」读取备份文件"
              className="mt-3 w-full resize-none rounded-lg border border-line bg-app p-2 font-mono text-xs text-ink outline-none focus:border-ink-3"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void pickImportFile()}
                className="rounded-full glass-btn px-3 py-1.5 text-xs text-ink transition-colors hover:brightness-110"
              >
                选择文件
              </button>
              {importResult && <span className="min-w-0 flex-1 truncate text-xs text-ink-2">{importResult}</span>}
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setImportOpen(false)}
                className="rounded-full glass-btn px-3 py-1.5 text-xs text-ink hover:brightness-110"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={!importText.trim()}
                className="rounded-full glass-btn px-4 py-1.5 text-xs font-medium text-accent hover:brightness-110 disabled:opacity-50"
              >
                确认导入
              </button>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  );
}
