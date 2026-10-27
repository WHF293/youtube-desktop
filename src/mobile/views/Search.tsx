import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ytApi } from "../../common/lib/youtube";
import { useSearchHistory } from "../../common/stores/searchHistory";
import type { VideoItem } from "../../common/types/youtube";
import Spinner from "../../common/components/Spinner";
import Icon from "../../common/components/Icon";
import { RowCard } from "../components/VideoCards";
import { videoIdOf } from "../../common/lib/format";

/** 移动端搜索页（替代桌面 SearchModal）：输入 + 历史 + 结果流触底分页。
 *  InnerTube suggestion 接口未在数据层暴露，联想词 M3 增补。 */
export default function SearchView() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<VideoItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loadingMore" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const history = useSearchHistory();

  // 进入页面自动聚焦拉起软键盘（UI 稿 A3）
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = async (query: string, pageToken?: string) => {
    const token = pageToken;
    setStatus(token ? "loadingMore" : "loading");
    setError("");
    try {
      const r = await ytApi.searchVideosPage(query, 25, token);
      setItems((prev) => (token ? [...prev, ...r.items] : r.items));
      setNextPageToken(r.nextPageToken);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const submit = (query: string) => {
    const query_ = query.trim();
    if (!query_) return;
    setQ(query_);
    history.remember(query_);
    void runSearch(query_);
    inputRef.current?.blur();
  };

  // 触底加载下一页
  useEffect(() => {
    if (status !== "ready" || !nextPageToken) return;
    const scroller = document.getElementById("m-scroll");
    if (!scroller) return;
    const check = () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 600) {
        void runSearch(q, nextPageToken);
      }
    };
    check();
    scroller.addEventListener("scroll", check, { passive: true });
    return () => scroller.removeEventListener("scroll", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, nextPageToken, q]);

  return (
    <div>
      {/* 搜索栏：返回 + 输入框（圆角胶囊）+ 清空 */}
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-line bg-surface px-2 py-2">
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-2"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full bg-flat px-3.5">
          <Icon name="search" size={16} className="shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(q);
            }}
            placeholder="搜索视频或频道"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
          />
          {q && (
            <button
              type="button"
              aria-label="清空输入"
              onClick={() => {
                setQ("");
                inputRef.current?.focus();
              }}
              className="shrink-0 text-xs text-ink-3"
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => submit(q)}
          className="shrink-0 px-1.5 text-[13px] font-bold text-accent"
        >
          搜索
        </button>
      </div>

      {status === "idle" ? (
        <>
          {/* 搜索历史（清空需二次确认，确认态 3 秒复位） */}
          {history.items.length > 0 && (
            <>
              <div className="flex items-center justify-between bg-surface px-3.5 pb-1 pt-3.5">
                <span className="text-[13px] font-bold">搜索历史</span>
                <ClearHistoryBtn />
              </div>
              {history.items.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => submit(h)}
                  className="flex w-full items-center gap-3 border-b border-line bg-surface px-3.5 py-2.5 text-left"
                >
                  <Icon name="history" size={15} className="text-ink-3" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{h}</span>
                  <span className="text-ink-3">↖</span>
                </button>
              ))}
            </>
          )}
        </>
      ) : status === "loading" ? (
        <Spinner label={`搜索「${q}」…`} />
      ) : status === "error" ? (
        <div className="p-6 text-center">
          <p className="text-sm text-ink-2">搜索失败：{error}</p>
          <button
            type="button"
            onClick={() => void runSearch(q)}
            className="mt-3 rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-white"
          >
            重试
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            {items.map((v, i) => (
              <RowCard key={videoIdOf(v) ?? i} video={v} />
            ))}
          </div>
          {items.length === 0 && status === "ready" && (
            <p className="p-6 text-sm text-ink-2">没有找到相关内容。</p>
          )}
          {status === "loadingMore" && <Spinner label="加载更多…" />}
          {!nextPageToken && items.length > 0 && status === "ready" && (
            <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
          )}
        </>
      )}
    </div>
  );
}

/** 清空历史：两步确认，3 秒自动复位（删除类二次确认约定） */
function ClearHistoryBtn() {
  const clear = useSearchHistory((s) => s.clear);
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      onClick={() => {
        if (!confirming) {
          setConfirming(true);
          timer.current = window.setTimeout(() => setConfirming(false), 3000);
          return;
        }
        window.clearTimeout(timer.current);
        setConfirming(false);
        clear();
      }}
      className={`text-[11px] font-semibold ${confirming ? "text-accent" : "text-ink-3"}`}
    >
      {confirming ? "确认清空？" : "🗑 清空"}
    </button>
  );
}
