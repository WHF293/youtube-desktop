import Img from "../../common/components/Img";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../../common/components/Icon";
import { ytApi } from "../../common/lib/youtube";
import { errorMessage } from "../../common/stores/videos";
import { useSearchHistory } from "../../common/stores/searchHistory";
import type { VideoItem } from "../../common/types/youtube";
import { bestThumb } from "../../common/lib/format";
import { videoIdOf } from "./VideoCard";

/**
 * 全局搜索弹窗（DocSearch 风格，参照 whf-stock-board 的 StockSearchModal）：
 * 遮罩居中卡片：大输入框 + 结果列表，↑/↓ 键切换、Enter 确认、Esc 关闭，
 * 点击遮罩关闭，打开时自动聚焦。
 *
 * YouTube search 一次消耗 100 配额单位，因此输入做 450ms 防抖直播搜索
 * （≥2 字符触发），结果直接进视频；未输入时展示最近搜索关键词。
 */

type Row =
  | { kind: "video"; video: VideoItem }
  | { kind: "query"; q: string };

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SearchModal({ open, onClose }: Props) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<VideoItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyStore = useSearchHistory();

  const isIdle = keyword.trim().length === 0;

  /** 当前展示列表：未输入 → 搜索历史；有输入 → 直播搜索结果 */
  const rows: Row[] = isIdle
    ? historyStore.items.map((q) => ({ kind: "query", q } as const))
    : results.map((v) => ({ kind: "video", video: v } as const));

  // 打开时重置并聚焦
  useEffect(() => {
    if (open) {
      setKeyword("");
      setResults([]);
      setError("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // 防抖直播搜索
  useEffect(() => {
    if (!open) return;
    const q = keyword.trim();
    if (q.length < 2) {
      setResults([]);
      setError("");
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      ytApi.searchVideos(q, 8)
        .then((items) => {
          setResults(items);
          setError("");
          setSearching(false);
        })
        .catch((e) => {
          setError(errorMessage(e));
          setResults([]);
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

  const close = () => onClose();

  const goSearchPage = (q: string) => {
    historyStore.remember(q);
    close();
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const openVideo = (id: string) => {
    const q = keyword.trim();
    if (q) historyStore.remember(q);
    close();
    navigate(`/watch/${id}`);
  };

  const confirmRow = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "video") {
      const id = videoIdOf(row.video);
      if (id) openVideo(id);
    } else {
      goSearchPage(row.q);
    }
  };

  const moveActive = (delta: number) => {
    const total = rows.length;
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
      // 有关键词时 Enter = 进入搜索页平铺全部结果；弹窗内点击具体条目才是快速打开
      const q = keyword.trim();
      if (!isIdle && q) {
        goSearchPage(q);
        return;
      }
      confirmRow(rows[activeIndex]);
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
            placeholder="搜索视频（Enter 打开，Ctrl+K 呼出）"
            className="h-8 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={close}
            aria-label="关闭搜索"
            className="rounded p-1 text-ink-3 hover:bg-flat hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* 列表区 */}
        <ul className="max-h-[50vh] space-y-1 overflow-auto p-2">
          {/* 平铺入口：把当前关键词的完整结果展开到搜索页（多语言 + 无限滚动） */}
          {!isIdle && (
            <li>
              <button
                type="button"
                onClick={() => goSearchPage(keyword.trim())}
                className={`flex w-full items-center gap-2 rounded-xl border border-line px-3 py-2 text-left text-sm transition-colors ${
                  activeIndex === -1 ? "bg-flat-strong" : "bg-flat/50 hover:bg-flat"
                }`}
              >
                <Icon name="openInNew" size={14} className="shrink-0 text-accent" />
                <span className="flex-1">
                  在页面中展开「<b className="font-medium text-ink">{keyword.trim()}</b>」的全部结果
                </span>
                <span className="shrink-0 text-xs text-ink-3">Enter</span>
              </button>
            </li>
          )}
          {!isIdle && searching && (
            <li className="px-3 py-2 text-xs text-ink-3">搜索中…</li>
          )}
          {!isIdle && !searching && error && (
            <li className="px-3 py-2 text-xs text-accent">{error}</li>
          )}
          {!searching && !error && rows.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-ink-3">
              {isIdle ? "输入关键词开始搜索" : "未找到匹配视频"}
            </li>
          )}
          {rows.map((row, index) => (
            <li key={row.kind === "video" ? videoIdOf(row.video) : `q-${row.q}`}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => confirmRow(row)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  index === activeIndex ? "bg-flat-strong" : "hover:bg-flat"
                }`}
              >
                {row.kind === "video" ? (
                  <>
                    <Img
                      src={bestThumb(row.video.snippet)}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-20 shrink-0 rounded bg-flat object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="clamp-2 block text-sm font-medium text-ink">
                        {row.video.snippet.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-3">
                        {row.video.snippet.channelTitle}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <Icon name="search" size={14} className="shrink-0 text-ink-3" />
                    <span className="flex-1 truncate text-sm text-ink">
                      搜索「{row.q}」
                    </span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* 底部快捷键提示 */}
        <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
          <span>↑ ↓ 切换</span>
          <span>Enter 搜索页</span>
          <span>点击结果直接播放</span>
          <span>Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
