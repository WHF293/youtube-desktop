import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * FreeTube 模式的订阅频道列表（本地存储，不依赖 Google 登录）。
 * 参考 FreeTube 的方案：订阅 = 本地频道 ID 集合 + 逐频道拉 RSS。
 * 频道来源：设置页手动添加（粘贴链接/ID，自动解析频道名）、Google Takeout 导入。
 * 分组：自定义博主分组，groupId 为 undefined 表示未分组。
 */
export interface SubChannel {
  id: string;
  title: string;
  addedAt: string;
  /** 频道头像（订阅页右栏展示；subsFeed 加载时懒补并持久化） */
  thumb?: string;
  /** 所属分组 id；undefined = 未分组 */
  groupId?: string;
}

export interface ChannelGroup {
  id: string;
  name: string;
}

interface ChannelsState {
  channels: SubChannel[];
  groups: ChannelGroup[];
  add: (id: string, title: string) => void;
  remove: (id: string) => void;
  setThumb: (id: string, thumb: string) => void;
  setTitle: (id: string, title: string) => void;
  addGroup: (name: string) => string;
  removeGroup: (id: string) => void;
  renameGroup: (id: string, name: string) => void;
  /** 调整分组顺序（dir -1 = 前移一位，1 = 后移一位） */
  moveGroup: (id: string, dir: -1 | 1) => void;
  /** 移动博主到分组（groupId 传 undefined = 移出分组） */
  moveChannel: (channelId: string, groupId: string | undefined) => void;
  /** 组内排序：把 activeId 的博主移动到 overId 的位置 */
  reorderChannel: (activeId: string, overId: string) => void;
  /** 分组排序：把 activeId 的分组移动到 overId 的位置 */
  reorderGroups: (activeGroupId: string, overGroupId: string) => void;
  /** Google Takeout 的 subscriptions.csv 文本导入，返回导入条数 */
  importTakeout: (csv: string) => number;
}

const newGroupId = () => `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/** title 是否疑似损坏：含替换符/控制字符，或混入了频道 ID（导入解析错位的产物） */
export function titleLooksBroken(title: string, channelId: string): boolean {
  if (!title) return true;
  if (title.includes("\uFFFD") || /[\u0000-\u001F]/.test(title)) return true;
  return title.includes(channelId);
}

export const useChannels = create<ChannelsState>()(
  persist(
    (set, get) => ({
      channels: [],
      groups: [],
      add: (id, title) => {
        const { channels } = get();
        if (channels.some((c) => c.id === id)) return;
        set({ channels: [...channels, { id, title, addedAt: new Date().toISOString() }] });
      },
      remove: (id) => set({ channels: get().channels.filter((c) => c.id !== id) }),
      setThumb: (id, thumb) =>
        set({
          channels: get().channels.map((c) => (c.id === id && c.thumb !== thumb ? { ...c, thumb } : c)),
        }),
      setTitle: (id, title) =>
        set({
          channels: get().channels.map((c) => (c.id === id && c.title !== title ? { ...c, title } : c)),
        }),
      addGroup: (name) => {
        const g: ChannelGroup = { id: newGroupId(), name: name.trim() };
        set({ groups: [...get().groups, g] });
        return g.id;
      },
      removeGroup: (id) =>
        set({
          // 组内频道回到未分组
          groups: get().groups.filter((g) => g.id !== id),
          channels: get().channels.map((c) => (c.groupId === id ? { ...c, groupId: undefined } : c)),
        }),
      renameGroup: (id, name) =>
        set({ groups: get().groups.map((g) => (g.id === id ? { ...g, name: name.trim() } : g)) }),
      moveGroup: (id, dir) => {
        const gs = [...get().groups];
        const i = gs.findIndex((g) => g.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= gs.length) return;
        [gs[i], gs[j]] = [gs[j], gs[i]];
        set({ groups: gs });
      },
      moveChannel: (channelId, groupId) =>
        set({
          channels: get().channels.map((c) => (c.id === channelId ? { ...c, groupId } : c)),
        }),
      reorderChannel: (activeId, overId) => {
        const arr = [...get().channels];
        const from = arr.findIndex((c) => c.id === activeId);
        const to = arr.findIndex((c) => c.id === overId);
        if (from < 0 || to < 0) return;
        const [moved] = arr.splice(from, 1);
        arr.splice(to, 0, moved);
        set({ channels: arr });
      },
      reorderGroups: (activeGroupId, overGroupId) => {
        const gs = [...get().groups];
        const from = gs.findIndex((g) => g.id === activeGroupId);
        const to = gs.findIndex((g) => g.id === overGroupId);
        if (from < 0 || to < 0) return;
        const [moved] = gs.splice(from, 1);
        gs.splice(to, 0, moved);
        set({ groups: gs });
      },
      importTakeout: (csv) => {
        // Takeout CSV 格式：Channel Id,Channel Url,Channel Title（首行为表头）。
        // 加固：去 BOM；引号感知解析（Title 含逗号时被引号包裹）；
        // title 清洗（控制字符/替换符/混入的频道 ID）。
        const text = csv.replace(/^\uFEFF/, "");
        const lines = text.split(/\r?\n/).slice(1).filter((l) => l.trim());
        const { channels } = get();
        const existing = new Set(channels.map((c) => c.id));
        const fresh: SubChannel[] = [];
        for (const line of lines) {
          // 引号感知的 CSV 字段切分
          const cols: string[] = [];
          let cur = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
              if (ch === '"') {
                if (line[i + 1] === '"') {
                  cur += '"';
                  i++;
                } else inQuotes = false;
              } else cur += ch;
            } else if (ch === '"') {
              inQuotes = true;
            } else if (ch === ",") {
              cols.push(cur);
              cur = "";
            } else cur += ch;
          }
          cols.push(cur);

          const clean = (t: string) =>
            t.replace(/[\u0000-\u001F\uFFFD]/g, "").replace(/\s+/g, " ").trim();
          const id = clean(cols[0] ?? "");
          if (!/^UC[\w-]{22}$/.test(id) || existing.has(id)) continue;
          // Title 优先；错位/脏数据清洗（去掉混入的频道 ID 片段）
          let title = clean(cols[2] ?? "") || clean(cols[1] ?? "") || id;
          title = title.replace(id, "").trim() || id;
          existing.add(id);
          fresh.push({ id, title, addedAt: new Date().toISOString() });
        }
        if (fresh.length > 0) set({ channels: [...channels, ...fresh] });
        return fresh.length;
      },
    }),
    { name: "yt-desktop-channels" },
  ),
);
