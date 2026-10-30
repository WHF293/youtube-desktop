import { useState } from "react";
import Icon from "./Icon";

/** 刷新固钉：常驻玻璃圆钮（刷新需求多在列表顶部，不随滚动浮现），点击触发刷新，
 *  请求期间图标旋转防连点。两端共用，className 提供定位与外观
 *  （移动端复用 "m-fab-top" 玻璃外观 + "m-fab-refresh" 纵向偏移）。 */
export default function RefreshFab({
  className,
  onRefresh,
}: {
  className: string;
  onRefresh: () => Promise<unknown> | void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="刷新"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        Promise.resolve(onRefresh()).finally(() => setBusy(false));
      }}
    >
      <Icon name="refresh" size={20} className={busy ? "animate-spin" : ""} />
    </button>
  );
}
