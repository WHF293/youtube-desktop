/** 通用二次确认弹窗（删除类操作）：标题 + 说明 + 取消/确认 */
export default function ConfirmDialog({
  title,
  message,
  confirmText = "确认删除",
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-xs rounded-xl border border-line bg-surface p-4 shadow-island">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {message && <p className="mt-1.5 text-xs leading-5 text-ink-2">{message}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg glass-btn px-3 py-1.5 text-xs text-ink hover:brightness-110"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:brightness-110"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
