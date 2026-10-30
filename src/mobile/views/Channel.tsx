import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useChannel } from "../../common/stores/channel";
import { useVideoNavQueue, toNavEntries } from "../../common/stores/videoNav";
import { bestThumb, formatCount } from "../../common/lib/format";
import Img from "../../common/components/Img";
import { RowSkeleton } from "../components/VideoCards";
import MobileNavBar from "../components/MobileNavBar";
import { RowCard } from "../components/VideoCards";
import { EmptyState, ErrorState } from "../components/StateViews";
import { videoIdOf } from "../../common/lib/format";

/** 移动端博主主页（/channel/:channelId）：频道信息岛 + 视频/播放列表两个 Tab。
 *  数据复用桌面同款 useChannel store（detail + videos + playlists 懒加载）；
 *  自带 NavBar（标题随频道名加载，返回 = 路由后退），MobileApp 不再渲染顶栏。 */
export default function ChannelView() {
  const { channelId = "" } = useParams();
  const navigate = useNavigate();
  const channel = useChannel();

  useEffect(() => {
    void channel.load(channelId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // 注册视频导航队列：详情页「上一个/下一个」按本频道视频列表顺序切换
  useVideoNavQueue(`m-channel-${channelId}`, toNavEntries(channel.videos));

  const { detail, videos, playlists, tab, status, playlistsStatus, error } = channel;

  return (
    <div className="m-page">
      <MobileNavBar
        className="m-nav--sticky"
        title={<span className="truncate">{detail?.snippet.title ?? "博主主页"}</span>}
        left={
          <button
            type="button"
            aria-label="返回"
            onClick={() => navigate(-1)}
            className="-ml-1.5 flex h-9 w-9 items-center justify-center rounded-full text-ink-2"
          >
            ‹
          </button>
        }
      />

      {status === "loading" || status === "idle" ? (
        <>
          {/* 频道信息骨架：头像圆 + 两行文字（对齐下方信息岛）+ 行卡骨架 */}
          <div className="flex items-center gap-3 border-b border-line bg-surface px-3.5 py-3.5">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-flat" />
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-flat" />
              <div className="mt-2 h-3 w-1/4 animate-pulse rounded bg-flat" />
            </div>
          </div>
          <RowSkeleton rows={6} />
        </>
      ) : status === "error" ? (
        <ErrorState desc={error} onRetry={() => void channel.load(channelId)} />
      ) : !detail ? (
        <EmptyState illust="👤" title="博主不存在" desc="频道可能已注销或链接有误" />
      ) : (
        <>
          {/* 频道信息岛 + Tab chips 固定头：sticky 吸顶（top 让出吸顶 navbar），列表滚动时保持不动 */}
          <div className="m-sticky-under-nav sticky z-10">
          {/* 频道信息岛 */}
          <div className="flex items-center gap-3 border-b border-line bg-surface px-3.5 py-3.5">
            <Img
              src={bestThumb(detail.snippet)}
              alt=""
              className="h-14 w-14 shrink-0 rounded-full bg-flat object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold text-ink">{detail.snippet.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-2">
                {[
                  detail.statistics?.subscriberCount
                    ? `${formatCount(detail.statistics.subscriberCount)}位订阅者`
                    : "",
                  detail.statistics?.videoCount ? `${formatCount(detail.statistics.videoCount)}个视频` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {detail.snippet.description && (
                <p className="clamp-2 mt-1 text-[11px] leading-relaxed text-ink-3">
                  {detail.snippet.description}
                </p>
              )}
            </div>
          </div>

          {/* Tab chips（与订阅页分组 chips 同款视觉） */}
          <div className="m-chips">
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
                className={`m-chip${tab === key ? " active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
          </div>

          {tab === "videos" ? (
            videos.length === 0 ? (
              <EmptyState illust="▤" title="暂无视频" desc="该频道还没有可展示的视频" />
            ) : (
              <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
                {videos.map((v, i) => (
                  <RowCard key={videoIdOf(v) ?? i} video={v} />
                ))}
              </div>
            )
          ) : playlistsStatus === "loading" || playlistsStatus === "idle" ? (
            <RowSkeleton rows={4} />
          ) : playlistsStatus === "error" ? (
            <ErrorState desc={error} onRetry={() => channel.setTab("playlists")} />
          ) : playlists.length === 0 ? (
            <EmptyState illust="≡" title="暂无播放列表" desc="该频道还没有公开的播放列表" />
          ) : (
            <div className="flex flex-col tablet:grid tablet:grid-cols-2 tablet:gap-x-2.5">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => navigate(`/playlist/${p.id}`)}
                  className="flex gap-2.5 border-b border-line bg-surface px-3.5 py-2.5 text-left active:bg-flat"
                >
                  <Img
                    src={p.snippet.thumbnails.medium?.url ?? ""}
                    alt=""
                    loading="lazy"
                    className="aspect-video w-[142px] shrink-0 rounded-xl bg-flat object-cover"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="clamp-2 block text-[13px] font-bold leading-[1.4] text-ink">
                      {p.snippet.title}
                    </span>
                    <span className="mt-1 block text-[10.5px] text-ink-3">
                      播放列表
                      {p.snippet.contentDetails?.itemCount
                        ? ` · ${p.snippet.contentDetails.itemCount} 个视频`
                        : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
