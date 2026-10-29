import { useEffect, useState } from "react";
import { useFavorites, type FavVideo } from "../../common/stores/favorites";
import { HistoryCard, FavGroupSheet } from "./History";
import BottomSheet from "../components/BottomSheet";
import { EmptyState } from "../components/StateViews";

/** 移动端收藏页（/favorites）：按收藏分组展示 + 标题关键字过滤 + ✕ 取消收藏（两步确认）+
 *  分组角标换分组。Navbar 由 MobileApp 渲染（返回箭头），本页只管内容 */
export default function FavoritesView() {
  const { videos, groups, remove, setGroup, removeGroup } = useFavorites();
  const [q, setQ] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 换分组：当前操作的视频 + 分组删除的两步确认（3 秒复位，与全局约定一致）
  const [regroupFor, setRegroupFor] = useState<string | null>(null);
  const [confirmGroupKey, setConfirmGroupKey] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmGroupKey) return;
    const t = setTimeout(() => setConfirmGroupKey(null), 3000);
    return () => clearTimeout(t);
  }, [confirmGroupKey]);

  const kw = q.trim().toLowerCase();
  const hit = (v: FavVideo) => !kw || v.title.toLowerCase().includes(kw);

  // 区块：自定义收藏分组在前，默认分组收尾；关键字过滤后空区块隐藏
  const sections = (
    [
      ...groups.map((g) => ({
        key: g.id,
        name: g.name,
        groupId: g.id,
        list: videos.filter((v) => v.groupId === g.id && hit(v)),
      })),
      { key: "default", name: "默认分组", list: videos.filter((v) => !v.groupId && hit(v)) },
    ] as { key: string; name: string; groupId?: string; list: FavVideo[] }[]
  ).filter((s) => s.groupId !== undefined || s.list.length > 0);

  const matched = videos.filter(hit);
  const target = videos.find((v) => v.videoId === removing);
  const regroupTarget = videos.find((v) => v.videoId === regroupFor);

  const favCard = (v: FavVideo) => {
    const g = groups.find((x) => x.id === v.groupId);
    return (
      <div key={v.videoId} className="relative">
        <HistoryCard
          entry={{
            videoId: v.videoId,
            title: v.title,
            channelId: v.channelId,
            channelTitle: v.channelTitle,
            // HistoryEntry 口径：thumb 必填 string / watchedAt 为毫秒；缺省按 videoId 兜底
            thumb: v.thumb || `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
            duration: "",
            watchedAt: Date.parse(v.addedAt),
          }}
        />
        {/* 换分组角标：点开分组选择 sheet */}
        <button
          type="button"
          aria-label="换到分组"
          onClick={() => setRegroupFor(v.videoId)}
          className="absolute bottom-2 left-2 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold text-white"
        >
          {g ? `# ${g.name}` : "# 默认"}
        </button>
        <button
          type="button"
          aria-label="取消收藏"
          onClick={() => {
            setRemoving(v.videoId);
            setConfirmOpen(true);
          }}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-xs text-white"
        >
          ✕
        </button>
      </div>
    );
  };

  return (
    <div className="m-page">
      {/* 搜索行：吸顶（navbar 由 MobileApp 渲染在滚动区外，top 即 0），按标题关键字过滤 */}
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-3.5 py-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索收藏标题…"
          enterKeyHint="search"
          className="w-full rounded-full bg-flat px-3.5 py-2 text-[13px] text-ink outline-none placeholder:text-ink-3"
        />
      </div>

      {videos.length === 0 ? (
        <EmptyState
          illust="☆"
          title="还没有收藏视频"
          desc="在视频播放页点击观看次数左侧的五角星即可收藏，支持按分组整理"
        />
      ) : matched.length === 0 ? (
        <EmptyState illust="🔍" title="没有匹配的收藏" desc={`没有标题包含「${q.trim()}」的收藏视频`} />
      ) : (
        <>
          {sections.map((s) => (
            <section key={s.key}>
              {/* 区块头：分组名 + 计数；自定义分组带删除（两步确认，视频移回默认分组） */}
              <div className="flex items-center gap-1.5 border-b border-line bg-surface px-3.5 py-2">
                <span className="text-[12.5px] font-bold text-ink">{s.name}</span>
                <span className="text-[11.5px] text-ink-3">（{s.list.length}）</span>
                {s.groupId &&
                  (confirmGroupKey === s.groupId ? (
                    <button
                      type="button"
                      onClick={() => {
                        removeGroup(s.groupId!);
                        setConfirmGroupKey(null);
                      }}
                      className="ml-auto text-[11px] font-bold text-red-500"
                    >
                      确认删除？
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`删除分组 ${s.name}`}
                      onClick={() => setConfirmGroupKey(s.groupId!)}
                      className="ml-auto text-[12px] text-ink-3"
                    >
                      ✕
                    </button>
                  ))}
              </div>
              {s.list.length > 0 && (
                <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
                  {s.list.map(favCard)}
                </div>
              )}
            </section>
          ))}
          <p className="py-4 text-center text-xs text-ink-3">
            {kw ? `匹配 ${matched.length} / ${videos.length} 个收藏` : `共 ${videos.length} 个收藏`}
          </p>
        </>
      )}

      {/* 取消收藏二次确认 */}
      <BottomSheet open={confirmOpen} onClose={() => setConfirmOpen(false)} title="取消收藏？">
        <p className="clamp-2 mb-3 text-[11.5px] text-ink-3">{target?.title}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="m-glass-btn flex-1 justify-center"
          >
            保留
          </button>
          <button
            type="button"
            onClick={() => {
              if (removing) remove(removing);
              setConfirmOpen(false);
            }}
            className="flex-1 rounded-full bg-accent py-2 text-[13px] font-bold text-white"
          >
            取消收藏
          </button>
        </div>
      </BottomSheet>

      {/* 换分组 sheet（复用历史页分组选择，onPick 走 setGroup 而非 add） */}
      <FavGroupSheet
        open={!!regroupTarget}
        onClose={() => setRegroupFor(null)}
        video={regroupTarget ?? { videoId: "", title: "" }}
        faved
        onPick={(groupId) => {
          if (regroupFor) setGroup(regroupFor, groupId);
          setRegroupFor(null);
        }}
      />
    </div>
  );
}
