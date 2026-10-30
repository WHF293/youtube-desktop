import Img from "../../common/components/Img";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePlayer } from "../../common/stores/player";
import { useFavorites } from "../../common/stores/favorites";
import { useHistory } from "../../common/stores/history";
import { useChannels } from "../../common/stores/channels";
import { useWatchLater } from "../../common/stores/watchLater";
import { useVideoNavQueue, toNavEntries, getVideoNavNeighbors } from "../../common/stores/videoNav";
import DownloadModal from "../components/DownloadModal";
import ConfirmDialog from "../../common/components/ConfirmDialog";
import { VideoRow } from "../components/VideoCard";
import { ErrorBox } from "../../common/components/Spinner";
import { VideoRowSkeleton } from "../components/VideoCard";
import PlayerSkeleton from "../../common/components/PlayerSkeleton";
import Icon from "../../common/components/Icon";
import { bestThumb, formatCount, formatDate, formatViews, parseDuration } from "../../common/lib/format";
import { openExternal } from "../../common/lib/open";

/** 观看页：iframe 播放器 + 标题/统计 + 频道信息 + 简介 + 评论 + 相关视频。
 *  播放器为静态 iframe（IFrame API 创建的播放器在本机 WebView2 实测黑屏，弃用），
 *  URL 参数尽力默认中文字幕；主播放器滚出视口顶部时小窗接力播放（同一节点换 CSS 定位） */
export default function Watch() {
  const { videoId = "" } = useParams();
  const player = usePlayer();
  const [descExpanded, setDescExpanded] = useState(false);
  const [favModalOpen, setFavModalOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [subMenuOpen, setSubMenuOpen] = useState(false);
  const isFav = useFavorites((s) => s.videos.some((v) => v.videoId === videoId));
  const inWatchLater = useWatchLater((s) => s.entries.some((e) => e.videoId === videoId));
  const [removeLaterConfirm, setRemoveLaterConfirm] = useState(false);

  // videoSlot 是播放器的文档流占位（保持原布局尺寸），小窗态时播放器本体脱离文档流
  const videoSlotRef = useRef<HTMLDivElement | null>(null);
  const [mini, setMini] = useState(false);
  const [miniClosed, setMiniClosed] = useState(false);

  useEffect(() => {
    setDescExpanded(false);
    setFavModalOpen(false);
    setDownloadOpen(false);
    setSubMenuOpen(false);
    setRemoveLaterConfirm(false);
    setMini(false);
    setMiniClosed(false);
    void player.load(videoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // 小窗接力：主播放器完全滚出视口顶部 → 播放器本体 fixed 到右下角（同一 DOM 节点换
  // CSS 定位，播放不中断）；回到可视区域 → 自动还原。可见性判定用 scroll + getBoundingClientRect
  // （与触底加载同款确定性方案）
  useEffect(() => {
    const slot = videoSlotRef.current;
    if (!slot) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const rect = slot.getBoundingClientRect();
      if (rect.bottom > 0) {
        // 主播放器重新可见：还原 + 重置手动关闭标记
        if (miniClosed) setMiniClosed(false);
        setMini(false);
      } else if (!miniClosed) {
        setMini(true);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    const scroller = document.getElementById("main-scroll");
    scroller?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      scroller?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [player.status, miniClosed]);

  // 观看记录：详情就绪后落库（重看 = 刷新时间置顶）
  const playerVideo = player.video;
  useEffect(() => {
    if (!playerVideo || typeof playerVideo.id !== "string") return;
    void useHistory.getState().record({
      videoId,
      title: playerVideo.snippet.title,
      channelId: playerVideo.snippet.channelId,
      channelTitle: playerVideo.snippet.channelTitle,
      // 详情接口（/next）不返回缩略图，bestThumb 可能为空；按 videoId 拼稳定 URL 兜底
      thumb:
        bestThumb(playerVideo.snippet) ||
        `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      duration: parseDuration(playerVideo.contentDetails?.duration),
    });
  }, [playerVideo, videoId]);

  // 注册「相关视频」队列（hook 须在 early return 前）：在详情页点相关视频后，
  // 下一个/上一个沿相关列表连续切换。hook 放 early return 前（Rules of Hooks）
  useVideoNavQueue("pc-watch-related", toNavEntries(player.related));

  // 切换视频（上一个/下一个）时同步切骨架屏：URL 的 videoId 已变而 store 还停在
  // 旧视频（load 在 effect 里才触发），这一帧若照常渲染，iframe key 变化会重挂载
  // 并闪 YouTube 白底加载页——判定不一致直接出骨架屏，避免白屏（2026-10-30 王总反馈）
  if (player.status === "loading" || player.videoId !== videoId) return <PlayerSkeleton />;
  if (player.status === "error" || !player.video) {
    return <ErrorBox message={player.error || "视频加载失败"} onRetry={() => void player.load(videoId)} />;
  }

  const { video, channel, comments, related } = player;
  const stats = video.statistics;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 xl:flex-row">
      {/* 左列：播放器 + 信息 + 评论 */}
      <div className="min-w-0 flex-1">
        {/* 视频占位：始终保持原布局尺寸；播放器本体在小窗态脱离文档流固定到右下角 */}
        <div ref={videoSlotRef} className="relative aspect-video w-full">
          <div
            className={
              mini
                ? "fixed bottom-6 right-6 z-50 aspect-video w-[400px] overflow-hidden rounded-xl border border-line bg-black shadow-island"
                : "absolute inset-0 overflow-hidden rounded-xl bg-black"
            }
          >
            <iframe
              key={videoId}
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&cc_load_policy=1&cc_lang_pref=zh-Hans&hl=zh-CN`}
              title={video.snippet.title}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            {/* 悬浮操作：小窗关闭（仅小窗态）+ 系统浏览器兜底 */}
            <div className="absolute right-2 top-2 z-10 flex gap-2">
              {mini && (
                <button
                  type="button"
                  onClick={() => setMiniClosed(true)}
                  title="关闭小窗"
                  aria-label="关闭小窗"
                  className="rounded-full bg-black/60 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
                >
                  <Icon name="close" size={18} />
                </button>
              )}
              <button
                type="button"
                onClick={() => void openExternal(`https://www.youtube.com/watch?v=${videoId}`)}
                title="在系统浏览器中播放"
                aria-label="在系统浏览器中播放"
                className="rounded-full bg-black/60 p-2 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
              >
                <Icon name="openInNew" size={18} />
              </button>
            </div>
          </div>
        </div>
        <p className="mt-1.5 text-xs leading-5 text-ink-3">
          视频经 WebView 加载，走启动时注入的代理（修改代理后需重启应用生效）；播放器尽力默认开启中文字幕
          （无原生中文字幕时可在播放器设置里选「自动翻译 → 中文（简体）」）；播放器滚出视口时自动收进右下角小窗继续播放；
          若个别视频黑屏，可能为该视频限制站外播放，点右上角按钮在系统浏览器中观看。
        </p>

        <h1 className="mt-3 text-xl font-semibold leading-7 text-ink">{video.snippet.title}</h1>

        {/* 上一个/下一个：沿来源列表（首页/搜索/博主页/订阅/待看/收藏/历史/播放列表/相关视频）顺序切换 */}
        <VideoNavSwitch videoId={videoId} />

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
            {/* 订阅按钮：未订阅显示「添加订阅」，已订阅点击弹二级确认（可退订） */}
            <SubscribeButton
              key={channel?.id || video.snippet.channelId}
              channelId={channel?.id || video.snippet.channelId}
              channelTitle={channel?.snippet.title || video.snippet.channelTitle}
              menuOpen={subMenuOpen}
              onMenuOpenChange={setSubMenuOpen}
            />
          </div>

          <div className="flex items-center gap-4 text-sm text-ink-2">
            {/* 稍后再看：未加入点击即入「待看」页；已加入点击二次确认移除 */}
            <button
              type="button"
              onClick={() => {
                if (inWatchLater) {
                  setRemoveLaterConfirm(true);
                  return;
                }
                useWatchLater.getState().add({
                  videoId,
                  title: video.snippet.title,
                  channelId: video.snippet.channelId,
                  channelTitle: video.snippet.channelTitle,
                  thumb: bestThumb(video.snippet),
                  duration: parseDuration(video.contentDetails?.duration),
                });
              }}
              aria-label={inWatchLater ? "移出待看" : "稍后再看"}
              title={inWatchLater ? "已在待看，点击移除" : "稍后再看，添加到待看页面"}
              className="inline-flex items-center"
            >
              <Icon
                name="watchLater"
                size={18}
                className={inWatchLater ? "text-accent" : "text-ink-2 hover:text-ink"}
              />
            </button>
            {/* 下载：弹窗选清晰度后加入队列（离线视频页查看进度） */}
            <button
              type="button"
              onClick={() => setDownloadOpen(true)}
              aria-label="下载视频"
              title="下载视频"
              className="inline-flex items-center"
            >
              <Icon name="download" size={17} className="text-ink-2 hover:text-ink" />
            </button>
            {/* 收藏星标：未收藏点击弹窗选分组收藏；已收藏点击打开管理（可取消/换分组） */}
            <button
              type="button"
              onClick={() => setFavModalOpen(true)}
              aria-label={isFav ? "管理收藏" : "收藏"}
              title={isFav ? "已收藏，点击管理" : "收藏"}
              className="inline-flex items-center"
            >
              <Icon
                name={isFav ? "star" : "starBorder"}
                size={18}
                className={isFav ? "text-accent" : "text-ink-2 hover:text-ink"}
              />
            </button>
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
          {player.commentsStatus === "loading" && (
            <div className="mt-4 flex flex-col gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-flat" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3 w-24 animate-pulse rounded bg-flat" />
                    <div className="mt-2 h-3 w-full animate-pulse rounded bg-flat" />
                    <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-flat" />
                  </div>
                </div>
              ))}
            </div>
          )}
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
        {player.relatedStatus === "loading" && <VideoRowSkeleton rows={4} />}
        {player.relatedStatus === "ready" &&
          related.map((v) => <VideoRow key={v.etag} video={v} />)}
        {player.relatedStatus === "ready" && related.length === 0 && (
          <p className="p-4 text-sm text-ink-2">没有找到相关视频。</p>
        )}
      </aside>

      {/* 移出待看二次确认 */}
      {removeLaterConfirm && (
        <ConfirmDialog
          title="移出待看？"
          message={video.snippet.title}
          confirmText="移出"
          onConfirm={() => {
            useWatchLater.getState().remove(videoId);
            setRemoveLaterConfirm(false);
          }}
          onCancel={() => setRemoveLaterConfirm(false)}
        />
      )}

      {/* 收藏弹窗：选择分组收藏 / 换分组 / 取消收藏 */}
      {favModalOpen && (
        <FavModal
          video={{
            videoId,
            title: video.snippet.title,
            channelId: video.snippet.channelId,
            channelTitle: video.snippet.channelTitle,
            // 详情接口不返回缩略图，落库前按 videoId 拼稳定 URL 兜底
            thumb: bestThumb(video.snippet) || `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          }}
          onClose={() => setFavModalOpen(false)}
        />
      )}

      {/* 下载弹窗：选清晰度加入队列 */}
      {downloadOpen && (
        <DownloadModal
          meta={{
            videoId,
            title: video.snippet.title,
            channelTitle: video.snippet.channelTitle,
            thumb: bestThumb(video.snippet),
            duration: parseDuration(video.contentDetails?.duration),
          }}
          onClose={() => setDownloadOpen(false)}
        />
      )}
    </div>
  );
}

/** 上一个/下一个切换条：从来源列表队列（videoNav 注册表）取相邻视频，点击原地换视频。
 *  当前视频不在任何队列（如刷新详情页直链）时整条不渲染 */
function VideoNavSwitch({ videoId }: { videoId: string }) {
  const navigate = useNavigate();
  // 同步纯查询，videoId 变化即重算
  const nav = useMemo(() => getVideoNavNeighbors(videoId), [videoId]);
  if (!nav.prev && !nav.next) return null;
  return (
    <div className="mt-2 flex items-center gap-2 text-sm">
      <button
        type="button"
        disabled={!nav.prev}
        onClick={() => nav.prev && navigate(`/watch/${nav.prev.id}`)}
        title={nav.prev?.title}
        aria-label="播放上一个视频"
        className="inline-flex items-center gap-1.5 rounded-full glass-btn px-3 py-1.5 text-ink disabled:opacity-40"
      >
        <Icon name="arrowLeft" size={14} />
        上一个
      </button>
      <span className="text-xs text-ink-3">
        {nav.pos} / {nav.total}
      </span>
      <button
        type="button"
        disabled={!nav.next}
        onClick={() => nav.next && navigate(`/watch/${nav.next.id}`)}
        title={nav.next?.title}
        aria-label="播放下一个视频"
        className="inline-flex items-center gap-1.5 rounded-full glass-btn px-3 py-1.5 text-ink disabled:opacity-40"
      >
        下一个
        <Icon name="chevronRight" size={14} />
      </button>
    </div>
  );
}

/** 订阅按钮：数据写本地订阅 store（useChannels，与设置页/博主管理共用）。
 *  未订阅 → 「添加订阅」点击即订；已订阅 → 「已订阅」点击弹二级弹窗，确认态 3 秒自动复位（删除类二次确认约定） */
function SubscribeButton({
  channelId,
  channelTitle,
  menuOpen,
  onMenuOpenChange,
}: {
  channelId: string;
  channelTitle: string;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const isSub = useChannels((s) => s.channels.some((c) => c.id === channelId));
  const add = useChannels((s) => s.add);
  const remove = useChannels((s) => s.remove);
  const [confirming, setConfirming] = useState(false);

  // 退订确认态 3 秒无操作自动复位
  useEffect(() => {
    if (!confirming) return;
    const t = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(t);
  }, [confirming]);

  if (!isSub) {
    return (
      <button
        type="button"
        onClick={() => add(channelId, channelTitle)}
        title={`订阅 ${channelTitle}`}
        className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-[filter] hover:brightness-110"
      >
        添加订阅
      </button>
    );
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          if (menuOpen) onMenuOpenChange(false);
          else {
            setConfirming(false);
            onMenuOpenChange(true);
          }
        }}
        className="rounded-full bg-flat px-4 py-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        已订阅
      </button>
      {menuOpen && (
        <>
          {/* 点击弹窗外任意区域关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => onMenuOpenChange(false)} aria-hidden="true" />
          <div className="absolute left-0 top-full z-50 mt-2 w-60 rounded-xl border border-line bg-surface p-3 shadow-island">
            <p className="text-sm text-ink">
              {confirming ? "确认取消订阅？" : `取消订阅「${channelTitle}」？`}
            </p>
            <div className="mt-3 flex items-center justify-end gap-2">
              {confirming ? (
                <button
                  type="button"
                  onClick={() => {
                    remove(channelId);
                    onMenuOpenChange(false);
                  }}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
                >
                  确认退订
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="rounded-lg px-3 py-1.5 text-xs text-accent transition-colors hover:bg-flat"
                >
                  取消订阅
                </button>
              )}
              <button
                type="button"
                onClick={() => onMenuOpenChange(false)}
                className="rounded-lg glass-btn px-3 py-1.5 text-xs text-ink hover:brightness-110"
              >
                保留
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** 收藏管理弹窗：未收藏时选分组收藏；已收藏时可换分组 / 取消收藏（二次确认） */
function FavModal({
  video,
  onClose,
}: {
  video: { videoId: string; title: string; channelId: string; channelTitle: string; thumb: string };
  onClose: () => void;
}) {
  const { videos, groups, add, remove, setGroup, addGroup } = useFavorites();
  const fav = videos.find((v) => v.videoId === video.videoId);
  const [pickedGroup, setPickedGroup] = useState<string | undefined>(fav?.groupId);
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const save = () => {
    if (fav) setGroup(video.videoId, pickedGroup);
    else add(video, pickedGroup);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-island">
        <h3 className="text-sm font-semibold text-ink">
          {fav ? "管理收藏" : "添加到收藏"}
        </h3>
        <p className="mt-1 truncate text-xs text-ink-3">{video.title}</p>

        <div className="mt-3 text-xs font-medium text-ink-2">收藏分组</div>
        <div className="mt-1.5 flex flex-col gap-1">
          {[{ id: "", name: "默认分组" }, ...groups].map((g) => (
            <label
              key={g.id || "default"}
              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-flat ${
                pickedGroup === g.id ? "text-ink" : "text-ink-2"
              }`}
            >
              <input
                type="radio"
                name="fav-group"
                checked={(pickedGroup ?? "") === g.id}
                onChange={() => setPickedGroup(g.id || undefined)}
                className="accent-[var(--color-accent)]"
              />
              {g.name}
            </label>
          ))}
        </div>

        {creating ? (
          <input
            autoFocus
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newGroupName.trim()) {
                const id = addGroup(newGroupName);
                setPickedGroup(id);
                setNewGroupName("");
                setCreating(false);
              }
              if (e.key === "Escape") {
                setCreating(false);
                setNewGroupName("");
              }
            }}
            placeholder="新分组名称，回车确认"
            className="mt-1.5 w-full rounded-lg border border-line bg-app px-2 py-1.5 text-xs text-ink outline-none focus:border-ink-3"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-1.5 flex items-center gap-1 rounded-lg px-1 py-1 text-xs text-ink-3 transition-colors hover:bg-flat hover:text-ink"
          >
            <Icon name="plus" size={12} />
            新建分组
          </button>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          {fav ? (
            confirmRemove ? (
              <button
                type="button"
                onClick={() => {
                  remove(video.videoId);
                  onClose();
                }}
                className="rounded-lg glass-btn px-3 py-1.5 text-xs font-medium text-accent"
              >
                确认取消收藏
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="rounded-full px-2 py-1.5 text-xs text-ink-3 transition-colors hover:text-accent"
              >
                取消收藏
              </button>
            )
          ) : (
            <span />
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg glass-btn px-3 py-1.5 text-xs text-ink hover:brightness-110"
            >
              关闭
            </button>
            <button
              type="button"
              onClick={save}
              className="rounded-lg glass-btn px-4 py-1.5 text-xs font-medium text-accent hover:brightness-110"
            >
              {fav ? "保存" : "收藏"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
