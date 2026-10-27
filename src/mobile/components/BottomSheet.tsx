import { useEffect, useRef, useState, type ReactNode } from "react";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
}

/**
 * 底部弹层（Bottom Sheet）：桌面端居中弹窗的移动形态。
 * 下载选清晰度 / 收藏选分组 / 订阅分组多选共用此容器（grip + 内容区 + safe-area）。
 */
export default function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  // 挂载后首次打开才有过渡；关闭时延迟卸载让动画走完（简化实现：150ms）
  const [render, setRender] = useState(open);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (open) {
      setRender(true);
    } else {
      timer.current = window.setTimeout(() => setRender(false), 150);
    }
    return () => window.clearTimeout(timer.current);
  }, [open]);

  if (!render) return null;
  return (
    <>
      <div
        className="m-sheet-mask"
        style={{ opacity: open ? 1 : 0, transition: "opacity .15s ease" }}
        onClick={onClose}
      />
      {/* 滑入动画挂在 .m-sheet__panel（内层）：外层 .m-sheet 的 transform
          留给 tablet 档居中定位（translateX(-50%)），两层互不干扰 */}
      <div className="m-sheet">
        <div
          className="m-sheet__panel"
          style={{
            transform: open ? "translateY(0)" : "translateY(100%)",
            transition: "transform .22s cubic-bezier(.16,1,.3,1)",
          }}
        >
          <div className="m-sheet__grip" />
          {title != null && <div className="text-[15px] font-extrabold">{title}</div>}
          {children}
        </div>
      </div>
    </>
  );
}
