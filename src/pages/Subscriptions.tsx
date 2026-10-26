import Img from "../components/Img";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSubsFeed } from "../stores/subsFeed";
import { useChannels, type SubChannel } from "../stores/channels";
import { registerPageRefresh } from "../lib/refresh";
import { VideoRow } from "../components/VideoCard";
import Icon from "../components/Icon";
import Spinner, { ErrorBox } from "../components/Spinner";

/** 订阅页（FreeTube 模式，Islands 双岛布局）：左侧订阅视频流岛 +
 *  右侧「我的博主」分组岛（可整体收起为头像列）。左右各自独立滚动。
 *  基于本地频道列表逐频道拉 RSS，无需任何 Google 登录 */
export default function Subscriptions() {
  return <FreeTubeFeed />;
}

/** 博主条目（纯展示 + 点击进频道页；分组整理在「博主分组」看板页用 dnd-kit 拖拽完成） */
function bloggerItem(
  c: SubChannel,
  groupsName: (id?: string) => string | undefined,
  onOpen: (id: string) => void,
) {
  const groupName = groupsName(c.groupId);
  return (
    <div
      key={c.id}
      onClick={() => onOpen(c.id)}
      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-flat"
    >
      {c.thumb ? (
        <Img src={c.thumb} alt="" className="h-8 w-8 shrink-0 rounded-full bg-flat object-cover" />
      ) : (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-flat text-xs font-medium text-ink-2">
          {c.title.slice(0, 1)}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{c.title}</span>
      {groupName && <span className="shrink-0 text-[10px] text-ink-3">{groupName}</span>}
    </div>
  );
}

/** 左侧订阅流岛 + 右栏博主分组岛 */
function FreeTubeFeed() {
  const { items, failed, status, error, load } = useSubsFeed();
  const { channels, groups, removeGroup } = useChannels();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  // 分组区块展开状态（默认全开）
  const [closedSections, setClosedSections] = useState<Record<string, boolean>>({});
  // 删除分组的二次确认：点过 X 的分组 key，3 秒不确认自动复位
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmDeleteKey) return;
    const t = setTimeout(() => setConfirmDeleteKey(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteKey]);

  useEffect(() => {
    // idle 正常首载；「ready 但 items 空」且本地有频道 = 上次加载异常中断的残留态，重载一次自愈
    if (status === "idle" || (status === "ready" && items.length === 0 && channels.length > 0)) {
      void load();
    }
  }, [status, items.length, channels.length, load]);

  // 右下角刷新固钉：重新拉取订阅流
  useEffect(() => registerPageRefresh("/subscriptions", () => void load()), [load]);

  const groupName = (id?: string) => groups.find((g) => g.id === id)?.name;

  // 分组区块：默认分组固定第一，自定义分组按用户排序跟在后面（空的自定义组保留）
  const sections: { key: string; name: string; groupId: string | undefined; list: SubChannel[] }[] = [
    { key: "ungrouped", name: "默认分组", groupId: undefined, list: channels.filter((c) => !c.groupId) },
    ...groups.map((g) => ({
      key: g.id,
      name: g.name,
      groupId: g.id as string | undefined,
      list: channels.filter((c) => c.groupId === g.id),
    })),
  ].filter((s) => s.groupId !== undefined || s.list.length > 0);

  return (
    <div className="flex h-full min-h-0 gap-2.5 p-2.5">
      {/* 左岛：标题 + 视频流（独立滚动） */}
      <section className="flex min-w-0 flex-1 flex-col rounded-2xl bg-surface shadow-island">
        <header className="shrink-0 px-4 pb-2 pt-4">
          <h1 className="text-lg font-semibold text-ink">订阅</h1>
          {failed.length > 0 && (
            <p className="mt-2 text-xs leading-5 text-ink-3">
              {failed.length} 个频道拉取失败（可能频道 ID 无效或网络波动）：{failed.join("、")}
            </p>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-2 pt-0">
          {status === "loading" || status === "idle" ? (
            <Spinner label="拉取订阅更新…" />
          ) : status === "error" ? (
            <ErrorBox message={error} onRetry={() => void load()} />
          ) : (
            <>
              {items.map((v) => (
                <VideoRow key={v.etag} video={v} />
              ))}
              {items.length === 0 &&
                (failed.length > 0 ? (
                  <div className="mx-2 my-6 rounded-lg border border-line bg-app p-5 text-sm text-ink">
                    <p className="font-medium text-accent">所有频道的更新都拉取失败了</p>
                    <p className="mt-2 leading-6 text-ink-2">
                      可能是网络波动或频道 ID 无效：{failed.join("、")}。请检查代理后点上方重试；
                      若反复失败，到设置页删除并重新添加对应频道。
                    </p>
                  </div>
                ) : (
                  <div className="mx-2 my-6 rounded-lg border border-line bg-app p-5 text-sm text-ink">
                    <p className="font-medium">还没有订阅频道</p>
                    <p className="mt-2 leading-6 text-ink-2">
                      在右侧「我的博主」下方添加频道（粘贴频道链接或 ID），或导入 Google Takeout 的
                      subscriptions.csv。订阅数据只存在本机，不需要登录 Google。
                    </p>
                    <Link
                      to="/help"
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full glass-btn px-4 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                    >
                      查看使用说明
                    </Link>
                  </div>
                ))}
            </>
          )}
        </div>
      </section>

      {/* 右岛：我的博主（分组展示，可整体收起为头像列，宽度带过渡动画；内部独立滚动） */}
      <aside
        aria-label="我的博主"
        className={`hidden shrink-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-island transition-[width] duration-200 ease-in-out lg:flex ${
          collapsed ? "w-[72px]" : "w-64"
        }`}
      >
        <header className="flex shrink-0 items-center px-3 pb-1 pt-3">
          {collapsed ? (
            /* 收起态：顶部为展开按钮（whf-stock-board 同款右栏开关图标），下方保留博主计数 */
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="展开我的博主"
              aria-label="展开我的博主"
              className="mx-auto flex flex-col items-center gap-1 rounded-full p-1 text-ink-3 transition-colors hover:bg-flat hover:text-ink"
            >
              <Icon name="panelRight" size={16} />
              <span className="text-[10px] font-semibold tabular-nums">{channels.length}</span>
            </button>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-ink">我的博主（{channels.length}）</h2>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                title="收起"
                aria-label="收起我的博主"
                className="ml-auto rounded-full p-1.5 text-ink-3 transition-colors hover:bg-flat hover:text-ink"
              >
                <Icon name="panelRight" size={16} />
              </button>
            </>
          )}
        </header>

        {collapsed ? (
          /* 收起态：头像一列（内部滚动），hover 显示「名称 · 分组」 */
          <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-2">
            {channels.map((c) => {
              const gn = groupName(c.groupId);
              return (
                <Link
                  key={c.id}
                  to={`/channel/${c.id}`}
                  title={gn ? `${c.title} · ${gn}` : c.title}
                  className="rounded-full p-0.5 transition-colors hover:bg-flat"
                >
                  {c.thumb ? (
                    <Img src={c.thumb} alt="" className="h-9 w-9 rounded-full bg-flat object-cover" />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-flat text-sm font-medium text-ink-2">
                      {c.title.slice(0, 1)}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-1">
            {sections.map((s) => {
              const open = !closedSections[s.key];
              return (
                <div key={s.key} className="mb-2">
                  {/* 区块头：展开/收起 + 删除分组 */}
                  <div className="flex items-center gap-1 rounded-lg px-1 py-1">
                    <button
                      type="button"
                      onClick={() => setClosedSections((m) => ({ ...m, [s.key]: !m[s.key] }))}
                      aria-expanded={open}
                      className="flex min-w-0 flex-1 items-center gap-1 text-left"
                    >
                      <Icon
                        name="chevronRight"
                        size={12}
                        className={`shrink-0 text-ink-3 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                      />
                      <span className="truncate text-xs font-medium text-ink-2">{s.name}</span>
                      <span className="shrink-0 text-xs text-ink-3">（{s.list.length}）</span>
                    </button>
                    {s.groupId &&
                      (confirmDeleteKey === s.key ? (
                        /* 二次确认态：3 秒内再点一次才真删 */
                        <button
                          type="button"
                          onClick={() => {
                            removeGroup(s.groupId!);
                            setConfirmDeleteKey(null);
                          }}
                          title="再次点击确认删除（博主将移回默认分组，不会删除博主）"
                          className="shrink-0 rounded px-1 text-xs font-medium text-accent"
                        >
                          确认删除
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(s.key)}
                          title={`删除分组「${s.name}」（组内博主移回默认分组，不会删除博主）`}
                          aria-label={`删除分组 ${s.name}`}
                          className="shrink-0 rounded p-0.5 text-ink-3 opacity-40 transition-opacity hover:text-accent hover:opacity-100"
                        >
                          <Icon name="close" size={12} />
                        </button>
                      ))}
                  </div>
                  {/* 区块内博主：grid-rows 高度过渡 */}
                  <div
                    className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="ml-2 flex flex-col border-l border-line pl-1.5 pt-0.5">
                        {s.list.map((c) => (
                          <div key={c.id}>
                            {bloggerItem(c, groupName, (id) => navigate(`/channel/${id}`))}
                          </div>
                        ))}
                        {s.list.length === 0 && (
                          <p className="px-1 py-1 text-xs text-ink-3">空分组 · 拖拽博主到这里</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 底部固定：分组管理入口（分组的新建/拖拽整理在「分组管理」页） */}
        <footer className="shrink-0 px-2.5 pb-3">
          <Link
            to="/groups"
            title="打开分组管理看板，整理分组"
            className={`block rounded-full glass-btn px-3 py-1.5 text-center text-sm text-ink hover:brightness-110 ${
              collapsed ? "mx-auto w-9 px-0" : ""
            }`}
          >
            {collapsed ? <Icon name="library" size={16} className="mx-auto" /> : "分组管理"}
          </Link>
        </footer>
      </aside>
    </div>
  );
}
