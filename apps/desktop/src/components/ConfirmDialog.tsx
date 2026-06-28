interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** 额外渲染的子内容（比如高亮显示危险命令） */
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[9999] animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-[#1c1c1e] w-[440px] rounded-2xl shadow-2xl flex flex-col border border-zinc-200/60 dark:border-zinc-700/60 overflow-hidden"
        style={{ boxShadow: "0 0 0 1px rgba(0,0,0,0.05), 0 25px 60px rgba(0,0,0,0.25)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with icon */}
        <div className="px-6 pt-6 pb-3 flex items-start gap-4">
          <div
            className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg ${
              danger
                ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                : "bg-brand-blue/10 dark:bg-brand-blue/20 text-brand-blue"
            }`}
          >
            {danger ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100 m-0 leading-snug">
              {title}
            </h3>
            <p className="text-[13px] text-zinc-500 dark:text-zinc-400 mt-1.5 leading-relaxed m-0 whitespace-pre-wrap">
              {message}
            </p>
          </div>
        </div>

        {/* Body: extra content like command display */}
        {children && (
          <div className="px-6 pb-2">
            {children}
          </div>
        )}

        {/* Footer buttons */}
        <div className="px-6 pb-5 pt-2 flex justify-end gap-2.5">
          <button
            className="h-9 px-5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg text-[13px] font-medium text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`h-9 px-5 text-white border-0 rounded-lg text-[13px] font-semibold cursor-pointer transition-all hover:-translate-y-[0.5px] active:translate-y-[0.5px] ${
              danger
                ? "bg-red-500 hover:bg-red-600 shadow-sm shadow-red-500/25"
                : "bg-brand-blue hover:bg-brand-blue-hover shadow-sm shadow-brand-blue/25"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
