import type { ReactNode } from "react";

/** 空态展位（对照 UI 稿 B2）：渐变插画 + 标题 + 描述 + 主操作按钮 */
export function EmptyState({
  illust = "○",
  title,
  desc,
  action,
}: {
  illust?: string;
  title: string;
  desc?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="m-state">
      <div className="m-state__illust">{illust}</div>
      <p className="m-state__t">{title}</p>
      {desc && <p className="m-state__d">{desc}</p>}
      {action && (
        <button type="button" className="m-state__btn relative" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** 错误态展位：主色警示圆 + 标题 + 原因 + 重试（主色玻璃按钮） */
export function ErrorState({
  title = "内容加载失败",
  desc,
  onRetry,
  extra,
}: {
  title?: string;
  desc?: ReactNode;
  onRetry?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className="m-state">
      <div className="m-state__err-illust">!</div>
      <p className="m-state__t">{title}</p>
      {desc && <p className="m-state__d">{desc}</p>}
      {extra}
      {onRetry && (
        <button type="button" className="m-state__btn relative" onClick={onRetry}>
          ↻ 重新加载
        </button>
      )}
    </div>
  );
}
