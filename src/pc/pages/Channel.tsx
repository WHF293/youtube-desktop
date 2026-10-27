import Img from "../../common/components/Img";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useChannel } from "../../common/stores/channel";
import { VideoCard } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../../common/components/Spinner";
import { bestThumb, formatCount, formatDate } from "../../common/lib/format";

/** 频道页：头图 + 频道信息 + 「视频 / 播放列表」两个 tab */
export default function Channel() {
  const { channelId = "" } = useParams();
  const channel = useChannel();

  useEffect(() => {
    void channel.load(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  if (channel.status === "loading") return <Spinner label="加载频道…" />;
  if (channel.status === "error" || !channel.detail) {
    return <ErrorBox message={channel.error || "频道加载失败"} onRetry={() => void channel.load(channelId)} />;
  }

  const { detail, videos, playlists, tab } = channel;
  const banner = detail.brandingSettings?.image?.bannerExternalUrl
    ? `${detail.brandingSettings.image.bannerExternalUrl}=w1707-fcrop64=1,00005a57ffffa5a8`
    : undefined;

  return (
    <div className="pb-6">
      {/* 头图 */}
      <div className="mx-4 mt-3 h-28 overflow-hidden rounded-xl bg-flat sm:h-40">
        {banner && <Img src={banner} alt="" className="h-full w-full object-cover" loading="lazy" />}
      </div>

      {/* 频道信息 */}
      <div className="mx-4 mt-4 flex items-center gap-4">
        <Img
          src={bestThumb(detail.snippet)}
          alt=""
          className="h-20 w-20 shrink-0 rounded-full bg-flat object-cover"
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-ink">{detail.snippet.title}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {[
              detail.snippet.customUrl ? `@${detail.snippet.customUrl.replace(/^@/, "")}` : "",
              detail.statistics?.subscriberCount ? `${formatCount(detail.statistics.subscriberCount)}位订阅者` : "",
              detail.statistics?.videoCount ? `${formatCount(detail.statistics.videoCount)}个视频` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {detail.snippet.description && (
            <p className="clamp-2 mt-1 max-w-2xl text-sm text-ink-3">{detail.snippet.description}</p>
          )}
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="mx-4 mt-4 flex gap-6 border-b border-line px-1">
        {(
          [
            ["videos", "视频"],
            ["playlists", "播放列表"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => channel.setTab(key)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${
              tab === key ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "videos" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-3 gap-y-5 p-4">
          {videos.map((v) => (
            <VideoCard key={v.etag} video={v} />
          ))}
          {videos.length === 0 && <p className="text-sm text-ink-2">没有获取到视频。</p>}
        </div>
      )}

      {tab === "playlists" && (
        <div className="p-4">
          {channel.playlistsStatus === "loading" && <Spinner label="加载播放列表…" />}
          {channel.playlistsStatus === "error" && (
            <p className="text-sm text-ink-2">播放列表加载失败：{channel.error}</p>
          )}
          {channel.playlistsStatus === "ready" && playlists.length === 0 && (
            <p className="text-sm text-ink-2">该频道没有公开播放列表。</p>
          )}
          <div className="space-y-2">
            {playlists.map((p) => (
              <div key={p.id} className="rounded-lg p-2 hover:bg-flat">
                <p className="text-sm font-medium text-ink">
                  {p.snippet.title}
                  <span className="ml-2 text-xs text-ink-3">
                    {p.contentDetails?.itemCount ?? p.snippet.contentDetails?.itemCount ?? "?"} 个视频 ·{" "}
                    {formatDate(p.snippet.publishedAt)}
                  </span>
                </p>
                {p.snippet.description && (
                  <p className="clamp-2 mt-1 text-xs text-ink-3">{p.snippet.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
