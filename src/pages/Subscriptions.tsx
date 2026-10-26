import Img from "../components/Img";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useSubs } from "../stores/subs";
import { useSettings } from "../stores/settings";
import Spinner, { ErrorBox } from "../components/Spinner";
import { bestThumb, formatRelativeDate } from "../lib/format";

/** 我的订阅：需要 OAuth access token（只读；token 在「API 设置」里配置） */
export default function Subscriptions() {
  const { items, status, error, load } = useSubs();
  const accessToken = useSettings((s) => s.accessToken);

  useEffect(() => {
    if (accessToken && status === "idle") void load();
  }, [accessToken, status, load]);

  if (!accessToken) {
    return (
      <div className="mx-6 my-8 rounded-lg border border-line bg-surface p-5 text-sm text-ink">
        <p className="font-medium">「我的订阅」需要 Google OAuth access token</p>
        <p className="mt-2 leading-6 text-ink-2">
          到 <Link to="/settings" className="text-accent underline">API 设置</Link> 里粘贴一个具有
          <code className="mx-1 rounded bg-flat px-1">youtube.readonly</code>权限的 access
          token 即可查看订阅列表（只读，不做任何写操作）。
        </p>
      </div>
    );
  }

  if (status === "loading") return <Spinner label="加载订阅…" />;
  if (status === "error") return <ErrorBox message={error} onRetry={() => void load()} />;

  return (
    <div>
      <h1 className="px-4 pt-4 text-lg font-semibold text-ink">我的订阅</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3 p-4">
        {items.map((s) => (
          <Link
            key={s.id}
            to={`/channel/${s.snippet.resourceId.channelId}`}
            className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:bg-flat"
          >
            <Img src={bestThumb(s.snippet)} alt="" className="h-12 w-12 shrink-0 rounded-full bg-flat object-cover" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{s.snippet.title}</p>
              <p className="text-xs text-ink-3">订阅于 {formatRelativeDate(s.snippet.publishedAt)}</p>
            </div>
          </Link>
        ))}
        {items.length === 0 && <p className="text-sm text-ink-2">没有获取到订阅。</p>}
      </div>
    </div>
  );
}
