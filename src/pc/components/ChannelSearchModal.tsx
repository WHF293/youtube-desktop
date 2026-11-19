import Img from "../../common/components/Img";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../common/components/Icon";
import { ytApi } from "../../common/lib/youtube";
import { errorMessage } from "../../common/stores/videos";
import { useChannels, subscribeFromSearch } from "../../common/stores/channels";
import { formatCount } from "../../common/lib/format";
import type { ChannelSearchResult } from "../../common/types/youtube";

/**
 * 频道搜索弹窗（订阅页右岛「我的博主」入口，DocSearch 风格同 SearchModal）：
 * 只搜博主（InnerTube Type=Channel 过滤，不返回视频），结果行直接「添加订阅」——
 * 摆脱「首页搜视频 → 点进视频页 → 再点订阅」的绕路。
 *
 * 450ms 防抖直播搜索（≥2 字符触发）；↑/↓ 切换、Enter 订阅选中项、Esc 关闭；
 * 点击行主体进频道页；已订阅置灰展示（退订入口在频道页/博主管理，弹窗内不嵌套确认）。
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

/** 搜索会话缓存（模块级）：点行进频道页返回后重开弹窗，恢复上次输入与结果列表
 *  （跳转后订阅页整个卸载，弹窗 state 丢失，靠这里续命）。显式关闭
 *  （Esc / 遮罩 / ✕）= 结束会话清缓存；进频道页离开则保留。 */
let searchCache: {
  keyword: string;
  results: ChannelSearchResult[];
  nextPageToken: string | null;
} | null = null;

export default function ChannelSearchModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<ChannelSearchResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // open 变 true 的首轮标记：搜索 effect 据此恢复会话缓存（结果直接用缓存，免「搜索中…」闪一次）
  const justOpenedRef = useRef(false);
  // 订阅态取自 store：订阅后按钮即时翻转，右岛「我的博主」列表同步出现新博主
  const channels = useChannels((s) => s.channels);

  const isIdle = keyword.trim().length < 2;

  // 打开时重置输入并聚焦；会话恢复在搜索 effect 里做（要配合其防抖跳过）
  useEffect(() => {
    if (open) {
      setKeyword("");
      setResults([]);
      setNextPageToken(null);
      setError("");
      setActiveIndex(0);
      justOpenedRef.current = true;
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // 会话快照：结果就绪时持续更新缓存（点行进频道页再重开弹窗可恢复）
  useEffect(() => {
    if (!open) return;
    if (!searching && !loadingMore && !error && results.length > 0) {
      searchCache = { keyword, results, nextPageToken };
    }
  }, [open, keyword, results, nextPageToken, searching, loadingMore, error]);

  // 防抖直播搜索；打开首轮恢复会话缓存（点行进频道页返回后重开弹窗直接出结果）
  useEffect(() => {
    if (!open) return;
    if (justOpenedRef.current) {
      justOpenedRef.current = false;
      const cached = searchCache;
      if (cached) {
        // 恢复输入与结果；下一轮（keyword 到位触发）靠下方引用比对跳过重搜
        setKeyword(cached.keyword);
        setResults(cached.results);
        setNextPageToken(cached.nextPageToken);
        setError("");
        setActiveIndex(0);
        return;
      }
    } else if (
      searchCache &&
      keyword === searchCache.keyword &&
      results === searchCache.results
    ) {
      // 恢复写入到位的渲染轮（keyword 从 "" 变为缓存值触发）：直接用缓存结果，不重搜
      return;
    }
    const q = keyword.trim();
    if (q.length < 2) {
      setResults([]);
      setNextPageToken(null);
      setError("");
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      ytApi.searchChannelsPage(q)
        .then((r) => {
          setResults(r.items);
          setNextPageToken(r.nextPageToken);
          setError("");
          setSearching(false);
        })
        .catch((e) => {
          setError(errorMessage(e));
          setResults([]);
          setNextPageToken(null);
          setSearching(false);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [keyword, open]);

  // 列表变化时选中项回到首位
  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  if (!open) return null;

  // 显式关闭 = 结束会话（清缓存）；点行进频道页走 openChannel 的 onClose 保留缓存
  const close = () => {
    searchCache = null;
    onClose();
  };

  const subscribe = (c: ChannelSearchResult) => {
    // add 同步生效（按钮/右岛即时翻转）；头像缺失时就地补拉频道详情（异步，不阻塞）
    void subscribeFromSearch(c);
  };

  const loadMore = () => {
    const q = keyword.trim();
    if (!q || !nextPageToken || loadingMore || searching) return;
    setLoadingMore(true);
    ytApi.searchChannelsPage(q, nextPageToken)
      .then((r) => {
        setResults((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...r.items.filter((c) => !seen.has(c.id))];
        });
        setNextPageToken(r.nextPageToken);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false)); // 翻页失败静默保留原列表，token 未动可再试
  };

  const openChannel = (id: string) => {
    // 保留会话缓存（不经过 close 清缓存）：从频道页返回重开弹窗恢复上次搜索
    onClose();
    navigate(`/channel/${id}`);
  };

  const moveActive = (delta: number) => {
    const total = results.length;
    if (total === 0) return;
    setActiveIndex((i) => (i + delta + total) % total);
  };

  const onInputKeydown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const c = results[activeIndex];
      if (c) subscribe(c);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    // 遮罩：点击关闭
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={close}>
      {/* 弹窗卡片（阻止冒泡） */}
      <div
        className="mx-auto mt-[10vh] w-[min(92vw,560px)] overflow-hidden rounded-2xl bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 输入区 */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Icon name="search" size={18} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={onInputKeydown}
            type="text"
            placeholder="搜索频道（Enter 订阅选中项）"
            className="h-8 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={close}
            aria-label="关闭频道搜索"
            className="rounded p-1 text-ink-3 hover:bg-flat hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* 结果区 */}
        <ul className="max-h-[50vh] space-y-1 overflow-auto p-2">
          {searching && <li className="px-3 py-2 text-xs text-ink-3">搜索中…</li>}
          {!searching && error && <li className="px-3 py-2 text-xs text-accent">{error}</li>}
          {!searching && !error && results.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-ink-3">
              {isIdle ? "输入频道名称搜索博主" : "未找到相关频道"}
            </li>
          )}
          {results.map((c, index) => (
            <li key={c.id}>
              <div
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => openChannel(c.id)}
                className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  index === activeIndex ? "bg-flat-strong" : "hover:bg-flat"
                }`}
              >
                {c.thumb ? (
                  <Img
                    src={c.thumb}
                    alt=""
                    loading="lazy"
                    className="h-10 w-10 shrink-0 rounded-full bg-flat object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-flat text-sm font-medium text-ink-2">
                    {c.title.slice(0, 1) || "?"}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{c.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">
                    {c.subscribers
                      ? `${formatCount(c.subscribers)}位订阅者`
                      : c.description || "频道"}
                  </span>
                </span>
                {channels.some((s) => s.id === c.id) ? (
                  <span className="shrink-0 rounded-full bg-flat px-3 py-1 text-xs text-ink-3">
                    已订阅
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      subscribe(c);
                    }}
                    title={`订阅 ${c.title}`}
                    className="shrink-0 rounded-full bg-accent px-3 py-1 text-xs font-medium text-white transition-[filter] hover:brightness-110"
                  >
                    添加订阅
                  </button>
                )}
              </div>
            </li>
          ))}
          {nextPageToken && !searching && !error && (
            <li>
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-xl px-3 py-2 text-center text-xs text-ink-3 transition-colors hover:bg-flat hover:text-ink disabled:opacity-50"
              >
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            </li>
          )}
        </ul>

        {/* 底部快捷键提示 */}
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
          <span>↑ ↓ 切换</span>
          <span>Enter 订阅</span>
          <span>点击行进频道页</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
