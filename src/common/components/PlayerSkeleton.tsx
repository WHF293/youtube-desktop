/** 播放器加载骨架屏（两端共用）：封面 16:9 大块 + 标题/频道两行 + 操作条占位。
 *  替代 Spinner：形态对齐视频详情页首屏，避免转圈跳变 */
export default function PlayerSkeleton() {
  return (
    <div>
      <div className="aspect-video w-full animate-pulse bg-flat" />
      <div className="p-3.5">
        <div className="h-4 w-3/4 animate-pulse rounded bg-flat" />
        <div className="mt-2.5 h-4 w-1/3 animate-pulse rounded bg-flat" />
        <div className="mt-4 h-10 w-full animate-pulse rounded bg-flat" />
      </div>
    </div>
  );
}
