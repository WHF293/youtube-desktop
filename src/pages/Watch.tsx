import Img from "../components/Img";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePlayer } from "../stores/player";
import { VideoRow } from "../components/VideoCard";
import Spinner, { ErrorBox } from "../components/Spinner";
import Icon from "../components/Icon";
import { bestThumb, formatCount, formatDate, formatViews, parseDuration } from "../lib/format";

/** 观看页：iframe 播放器 + 标题/统计 + 频道信息 + 简介 + 评论 + 相关视频 */
export default function Watch() {
  const { videoId = "" } = useParams();
  const player = usePlayer();
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    setDescExpanded(false);
    void player.load(videoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  if (player.status === "loading") return <Spinner label="加载视频…" />;
  if (player.status === "error" || !player.video) {
    return <ErrorBox message={player.error || "视频加载失败"} onRetry={() => void player.load(videoId)} />;
  }

  const { video, channel, comments, related } = player;
  const stats = video.statistics;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 xl:flex-row">
      {/* 左列：播放器 + 信息 + 评论 */}
      <div className="min-w-0 flex-1">
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            key={videoId}
            src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
            title={video.snippet.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        <h1 className="mt-3 text-xl font-semibold leading-7 text-ink">{video.snippet.title}</h1>

        {/* 频道行 + 统计 */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {channel && (
              <Link to={`/channel/${channel.id}`} className="shrink-0">
                <Img
                  src={bestThumb(channel.snippet)}
                  alt=""
                  className="h-10 w-10 rounded-full bg-flat object-cover"
                />
              </Link>
            )}
            <div className="min-w-0">
              {channel ? (
                <Link to={`/channel/${channel.id}`} className="block truncate text-sm font-medium text-ink hover:text-ink-2">
                  {channel.snippet.title}
                </Link>
              ) : (
                <span className="block truncate text-sm font-medium text-ink">{video.snippet.channelTitle}</span>
              )}
              {channel?.statistics?.subscriberCount && (
                <span className="text-xs text-ink-2">{formatCount(channel.statistics.subscriberCount)}位订阅者</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-ink-2">
            {stats?.viewCount && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="eye" size={16} />
                {formatViews(stats.viewCount)}
              </span>
            )}
            {stats?.likeCount && (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="thumbUp" size={15} />
                {formatCount(stats.likeCount)}
              </span>
            )}
            {video.contentDetails?.duration && (
              <span className="rounded bg-flat px-2 py-0.5 text-xs">
                时长 {parseDuration(video.contentDetails.duration)}
              </span>
            )}
          </div>
        </div>

        {/* 简介 */}
        <div
          className="mt-3 cursor-pointer rounded-xl bg-flat p-3 text-sm text-ink"
          onClick={() => setDescExpanded((v) => !v)}
        >
          <p className="font-medium">
            {formatViews(stats?.viewCount)} · {formatDate(video.snippet.publishedAt)}
            <span className="ml-2 text-xs text-ink-2">{descExpanded ? "收起" : "…展开"}</span>
          </p>
          <p className={`mt-1 whitespace-pre-wrap leading-6 text-ink-2 ${descExpanded ? "" : "clamp-2"}`}>
            {video.snippet.description || "（无简介）"}
          </p>
        </div>

        {/* 评论 */}
        <section className="mt-5">
          <h2 className="text-base font-semibold text-ink">评论</h2>
          {player.commentsStatus === "loading" && <Spinner label="加载评论…" />}
          {player.commentsStatus === "error" && (
            <p className="mt-2 text-sm text-ink-2">评论加载失败：{player.error}</p>
          )}
          {player.commentsStatus === "ready" && comments.length === 0 && (
            <p className="mt-2 text-sm text-ink-2">还没有评论。</p>
          )}
          {player.commentsStatus === "ready" &&
            comments.map((c) => {
              const cs = c.snippet.topLevelComment.snippet;
              return (
                <div key={c.id} className="mt-4 flex gap-3">
                  <Img src={cs.authorProfileImageUrl} alt="" className="h-9 w-9 shrink-0 rounded-full bg-flat" />
                  <div className="min-w-0">
                    <p className="text-xs text-ink-2">
                      <span className="font-medium text-ink">{cs.authorDisplayName}</span>{" "}
                      {formatDate(cs.publishedAt)}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">{cs.textOriginal}</p>
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-3">
                      <Icon name="thumbUp" size={13} />
                      {formatCount(cs.likeCount)}
                    </p>
                  </div>
                </div>
              );
            })}
        </section>
      </div>

      {/* 右列：相关视频 */}
      <aside className="w-full shrink-0 xl:w-[400px]">
        <h2 className="mb-1 text-base font-semibold text-ink">相关视频</h2>
        {player.relatedStatus === "loading" && <Spinner label="加载相关视频…" />}
        {player.relatedStatus === "ready" &&
          related.map((v) => <VideoRow key={v.etag} video={v} />)}
        {player.relatedStatus === "ready" && related.length === 0 && (
          <p className="p-4 text-sm text-ink-2">没有找到相关视频。</p>
        )}
      </aside>
    </div>
  );
}
