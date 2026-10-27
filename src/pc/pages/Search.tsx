import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useVideos } from "../../common/stores/videos";
import { VideoRow } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../../common/components/Spinner";

/** 搜索结果页：/search?q=xxx */
export default function Search() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const { items, status, error, mode, query, loadSearch } = useVideos();

  useEffect(() => {
    if (q && (mode !== "search" || query !== q)) void loadSearch(q);
  }, [q, mode, query, loadSearch]);

  if (!q) {
    return <p className="p-6 text-sm text-ink-2">在顶部搜索框输入关键词开始搜索。</p>;
  }
  if (status === "loading") return <Spinner label={`搜索「${q}」…`} />;
  if (status === "error") return <ErrorBox message={error} onRetry={() => void loadSearch(q)} />;

  return (
    <div>
      <h1 className="px-4 pt-4 text-base text-ink-2">
        「<span className="font-medium text-ink">{q}</span>」的搜索结果
      </h1>
      <div className="p-2">
        {items.map((v) => (
          <VideoRow key={v.etag} video={v} />
        ))}
        {items.length === 0 && <p className="p-6 text-sm text-ink-2">没有找到相关视频。</p>}
      </div>
    </div>
  );
}
