import { useEffect, useState } from "react";
import { useChannels } from "../../common/stores/channels";

/**
 * 订阅按钮（PC 端共用：观看页 up 主区 / 频道页信息区）。
 * 数据写本地订阅 store（useChannels，与设置页/博主管理共用）。
 * 未订阅 → 「添加订阅」点击即订；已订阅 → 「已订阅」点击弹二级弹窗，
 * 确认态 3 秒自动复位（删除类二次确认约定）。
 */
export default function SubscribeButton({
  channelId,
  channelTitle,
  thumb,
  menuOpen,
  onMenuOpenChange,
}: {
  channelId: string;
  channelTitle: string;
  /** 传入即订阅时同步头像落库（频道页有现成头像，免等启动自愈补拉） */
  thumb?: string;
  /** 受控开关（观看页与其他菜单互斥时由父级传入）；不传则组件自管 */
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
}) {
  const isSub = useChannels((s) => s.channels.some((c) => c.id === channelId));
  const add = useChannels((s) => s.add);
  const setThumb = useChannels((s) => s.setThumb);
  const remove = useChannels((s) => s.remove);
  const [confirming, setConfirming] = useState(false);
  // 弹窗开合：受控（父级传入）或自管
  const [menuOpenSelf, setMenuOpenSelf] = useState(false);
  const controlled = menuOpen !== undefined && onMenuOpenChange !== undefined;
  const isOpen = controlled ? menuOpen : menuOpenSelf;
  const setOpen = controlled ? onMenuOpenChange : setMenuOpenSelf;

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
        onClick={() => {
          add(channelId, channelTitle);
          if (thumb) setThumb(channelId, thumb);
        }}
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
          if (isOpen) setOpen(false);
          else {
            setConfirming(false);
            setOpen(true);
          }
        }}
        className="rounded-full bg-flat px-4 py-1.5 text-sm text-ink-2 transition-colors hover:text-ink"
      >
        已订阅
      </button>
      {isOpen && (
        <>
          {/* 点击弹窗外任意区域关闭 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
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
                    setOpen(false);
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
                onClick={() => setOpen(false)}
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
