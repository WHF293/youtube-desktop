export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-2">
      <div
        className="h-8 w-8 animate-spin rounded-full border-3 border-line border-t-accent"
        style={{ borderWidth: 3 }}
        role="status"
        aria-label="加载中"
      />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mx-6 my-8 rounded-lg border border-line bg-surface p-5 text-sm">
      <div className="flex items-center gap-2 font-medium text-ink">
        <span className="inline-block h-2 w-2 rounded-full bg-accent" />
        加载失败
      </div>
      <p className="mt-2 break-all text-ink-2">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full bg-flat px-4 py-1.5 text-sm text-ink hover:bg-flat-strong"
        >
          重试
        </button>
      )}
    </div>
  );
}
