import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ytApi } from "../../common/lib/youtube";
import { useChannels, subscribeFromSearch } from "../../common/stores/channels";
import { formatCount } from "../../common/lib/format";
import type { ChannelSearchResult } from "../../common/types/youtube";
import Icon from "../../common/components/Icon";
import Img from "../../common/components/Img";
import { EmptyState, ErrorState } from "../components/StateViews";

/** 移动端频道搜索页（订阅页 navbar 搜索入口）：只搜博主（InnerTube Type=Channel 过滤），
 *  结果行直接「订阅」——摆脱「首页搜视频 → 点进视频页 → 再点订阅」的绕路。
 *  布局同 /search 页（自带搜索栏，不渲染 MobileNavBar），但为输入即搜（450ms 防抖）。 */
export default function SubsSearchView() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ChannelSearchResult[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "loadingMore" | "ready" | "error">(
    "idle",
  );
  const [error, setError] = useState("");
  // 直播搜索乱序响应防护：输入连打时旧请求后到不能覆盖新结果
  const seqRef = useRef(0);
  // 错误重试触发器（effect 依赖项，重试时自增重跑搜索）
  const [reload, setReload] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // 轻提示 toast（订阅成功反馈，1.8s 自动消失，同观看页）
  const [toast, setToast] = useState("");
  const toastTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  const showToast = (text: string) => {
    setToast(text);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 1800);
  };

  // 订阅态取自 store：订阅后按钮即时翻转，订阅页横滑岛同步出现新博主
  const channels = useChannels((s) => s.channels);

  // 防抖直播搜索（≥2 字符触发）
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      seqRef.current++;
      setItems([]);
      setNextPageToken(null);
      setError("");
      setStatus("idle");
      return;
    }
    const seq = ++seqRef.current;
    setStatus("loading");
    const timer = setTimeout(() => {
      ytApi.searchChannelsPage(query)
        .then((r) => {
          if (seq !== seqRef.current) return;
          setItems(r.items);
          setNextPageToken(r.nextPageToken);
          setError("");
          setStatus("ready");
        })
        .catch((e) => {
          if (seq !== seqRef.current) return;
          setError(e instanceof Error ? e.message : String(e));
          setStatus("error");
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [q, reload]);

  const loadMore = () => {
    const query = q.trim();
    if (!query || !nextPageToken || status !== "ready") return;
    setStatus("loadingMore");
    ytApi.searchChannelsPage(query, nextPageToken)
      .then((r) => {
        setItems((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...r.items.filter((c) => !seen.has(c.id))];
        });
        setNextPageToken(r.nextPageToken);
        setStatus("ready");
      })
      .catch(() => setStatus("ready")); // 翻页失败保留原列表，token 未动可再触底重试
  };

  // 触底加载下一页（同搜索页：#m-scroll 600px 预取）
  useEffect(() => {
    if (status !== "ready" || !nextPageToken) return;
    const scroller = document.getElementById("m-scroll");
    if (!scroller) return;
    const check = () => {
      if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 600) {
        loadMore();
      }
    };
    check();
    scroller.addEventListener("scroll", check, { passive: true });
    return () => scroller.removeEventListener("scroll", check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, nextPageToken, q, reload]);

  const subscribe = (c: ChannelSearchResult) => {
    // add 同步生效；头像缺失时就地补拉频道详情（异步，不阻塞 toast）
    void subscribeFromSearch(c);
    showToast(`已订阅「${c.title}」`);
  };

  return (
    <div className="m-page">
      {/* 搜索栏：返回 + 输入框（圆角胶囊）+ 清空；顶部安全区与 navbar 同源
          （--m-inset-top 原生层注入，env() 兜底——Android WebView 里 env() 恒 0，
          只写 env() 真机必被状态栏遮挡）。本页不渲染 m-nav */}
      <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-line bg-surface px-2 pb-2 pt-[calc(var(--m-inset-top,env(safe-area-inset-top,0px))+8px)]">
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
              if (e.key === "Enter") inputRef.current?.blur();
            }}
            placeholder="搜索频道，直接添加订阅"
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
      </div>

      {status === "idle" ? (
        <p className="px-4 py-10 text-center text-[13px] leading-6 text-ink-3">
          输入频道名称搜索博主
          <br />
          搜到后可直接添加订阅
        </p>
      ) : status === "loading" ? (
        <ChannelRowSkeleton />
      ) : status === "error" ? (
        <ErrorState title="搜索失败" desc={error} onRetry={() => setReload((r) => r + 1)} />
      ) : (
        <>
          {items.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              subscribed={channels.some((s) => s.id === c.id)}
              onSubscribe={() => subscribe(c)}
            />
          ))}
          {items.length === 0 && status === "ready" && (
            <EmptyState illust="⌕" title="没有找到相关频道" desc="换个关键词试试" />
          )}
          {status === "loadingMore" && <ChannelRowSkeleton rows={2} />}
          {!nextPageToken && items.length > 0 && status === "ready" && (
            <p className="py-6 text-center text-xs text-ink-3">没有更多了</p>
          )}
        </>
      )}

      {/* 订阅成功轻提示 */}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center">
          <span className="rounded-full bg-black/80 px-4 py-2 text-[12.5px] font-medium text-white shadow-island">
            {toast}
          </span>
        </div>
      )}
    </div>
  );
}

/** 结果行：头像 + 名称 + 订阅数 + 订阅按钮；点行主体进频道页（按钮 stopPropagation） */
function ChannelRow({
  channel: c,
  subscribed,
  onSubscribe,
}: {
  channel: ChannelSearchResult;
  subscribed: boolean;
  onSubscribe: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div
      className="flex items-center gap-3 border-b border-line bg-surface px-3.5 py-2.5"
      onClick={() => navigate(`/channel/${c.id}`)}
    >
      {c.thumb ? (
        <Img
          src={c.thumb}
          alt=""
          loading="lazy"
          className="h-11 w-11 shrink-0 rounded-full bg-flat object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-flat text-base font-medium text-ink-2">
          {c.title.slice(0, 1) || "?"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-ink">{c.title}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">
          {c.subscribers ? `${formatCount(c.subscribers)}位订阅者` : c.description || "频道"}
        </span>
      </span>
      {subscribed ? (
        <span className="shrink-0 rounded-full bg-flat px-3 py-1.5 text-[12px] text-ink-3">
          已订阅
        </span>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSubscribe();
          }}
          className="shrink-0 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-bold text-white"
        >
          订阅
        </button>
      )}
    </div>
  );
}

/** 频道行骨架（圆头像 + 两行文字条，rows=2 供触底加载复用） */
function ChannelRowSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="bg-surface">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-flat" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-flat" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-flat" />
          </div>
        </div>
      ))}
    </div>
  );
}
