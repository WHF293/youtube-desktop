import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites, type FavVideo } from "../../common/stores/favorites";
import { refreshChannelsMeta } from "../../common/stores/subsFeed";
import { registerPageRefresh } from "../../common/lib/refresh";
import Img from "../../common/components/Img";
import Icon from "../../common/components/Icon";
import { formatRelativeDate } from "../../common/lib/format";

/** 收藏页：按收藏分组展示收藏的视频，支持移动分组与删除（二次确认） */
export default function Favorites() {
  const { videos, groups, remove, setGroup, removeGroup } = useFavorites();
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  // 标题关键字过滤（与待看页同款搜索框）
  const [q, setQ] = useState("");

  const kw = q.trim().toLowerCase();
  const matched = (v: FavVideo) => !kw || v.title.toLowerCase().includes(kw);

  useEffect(() => {
    if (!confirmKey) return;
    const t = setTimeout(() => setConfirmKey(null), 3000);
    return () => clearTimeout(t);
  }, [confirmKey]);

  // 右下角刷新固钉：刷新博主远端元数据（头像/标题自愈，全应用共享数据）
  useEffect(() => registerPageRefresh("/favorites", () => void refreshChannelsMeta()), []);

  // 区块：自定义收藏分组在前，默认分组收尾（关键字过滤后空区块隐藏）
  const sections: { key: string; name: string; groupId: string | undefined; list: FavVideo[] }[] = [
    ...groups.map((g) => ({
      key: g.id,
      name: g.name,
      groupId: g.id as string | undefined,
      list: videos.filter((v) => v.groupId === g.id && matched(v)),
    })),
    { key: "default", name: "默认分组", groupId: undefined, list: videos.filter((v) => !v.groupId && matched(v)) },
  ].filter((s) => s.groupId !== undefined || s.list.length > 0);

  const videoRow = (v: FavVideo) => {
    const confirmId = `v_${v.videoId}`;
    return (
      <div key={v.videoId} className="flex items-center gap-3 rounded-xl border border-line bg-app p-2">
        <Link to={`/watch/${v.videoId}`} className="flex min-w-0 flex-1 items-center gap-3">
          {/* 早期落库的记录可能无缩略图，按 videoId 拼稳定 URL 兜底 */}
          <Img
            src={v.thumb || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`}
            alt=""
            className="h-12 w-20 shrink-0 rounded-lg bg-flat object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{v.title}</p>
            <p className="truncate text-xs text-ink-3">
              {v.channelTitle} · 收藏于 {formatRelativeDate(v.addedAt)}
            </p>
          </div>
        </Link>
        {/* 移动分组 */}
        <select
          value={v.groupId ?? ""}
          onChange={(e) => setGroup(v.videoId, e.target.value || undefined)}
          aria-label={`移动 ${v.title} 到分组`}
          className="shrink-0 rounded-lg border border-line bg-app px-2 py-1 text-xs text-ink-2 outline-none"
        >
          <option value="">默认分组</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {/* 删除（二次确认） */}
        {confirmKey === confirmId ? (
          <button
            type="button"
            onClick={() => {
              remove(v.videoId);
              setConfirmKey(null);
            }}
            title="再次点击确认取消收藏"
            className="shrink-0 rounded px-1 text-xs font-medium text-accent"
          >
            确认
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmKey(confirmId)}
            title="取消收藏"
            aria-label={`取消收藏 ${v.title}`}
            className="shrink-0 rounded-full p-1 text-ink-3 transition-colors hover:bg-flat hover:text-accent"
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-3xl p-4">
        <h1 className="flex items-center gap-2 text-lg font-semibold text-ink">
          <Icon name="star" size={18} className="text-accent" />
          收藏（{videos.length}）
        </h1>

        {videos.length > 0 && (
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索标题关键字…"
            className="mt-3 w-full rounded-xl border border-line bg-app px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-accent"
          />
        )}

        {videos.length > 0 && videos.filter(matched).length === 0 && (
          <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-ink-3">
            没有标题包含「{q.trim()}」的收藏视频
          </p>
        )}

        {sections.map((s) => (
          <section key={s.key} className="mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-ink-2">
                {s.name}（{s.list.length}）
              </h2>
              {s.groupId && (
                <button
                  type="button"
                  onClick={() => removeGroup(s.groupId!)}
                  title={`删除收藏分组「${s.name}」（视频移回默认分组）`}
                  className="rounded p-0.5 text-ink-3 opacity-40 transition-opacity hover:text-accent hover:opacity-100"
                >
                  <Icon name="close" size={12} />
                </button>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-2">{s.list.map(videoRow)}</div>
            {s.list.length === 0 && (
              <p className="rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-5 text-ink-3">
                该分组还没有收藏视频：在视频播放页点击观看次数左侧的五角星即可收藏到这里。
              </p>
            )}
          </section>
        ))}

        {videos.length === 0 && (
          <div className="mt-6 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-ink-2">
            <p className="font-medium text-ink">还没有收藏视频</p>
            <p className="mt-2 leading-6">
              在视频播放页点击<b>观看次数左侧的五角星</b>即可收藏，支持按收藏分组整理。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
