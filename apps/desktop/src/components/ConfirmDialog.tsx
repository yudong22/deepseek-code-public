interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1200]" onClick={onCancel}>
      <div className="bg-white dark:bg-[#1c1c1e] w-[380px] rounded-xl shadow-xl flex flex-col border border-zinc-200 dark:border-zinc-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e3e3e3] dark:border-[#2c2c2e] shrink-0">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-[#f5f5f7] m-0">{title}</h3>
        </div>
        <div className="p-5 flex flex-col gap-3">
          <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed m-0 whitespace-pre-wrap">{message}</p>
        </div>
        <div className="px-5 py-4 border-t border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-end gap-2 shrink-0">
          <button
            className="h-8.5 px-4 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            className={`h-8.5 px-4 text-white border-0 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
              danger ? "bg-red-500 hover:bg-red-600" : "bg-brand-blue hover:bg-brand-blue-hover"
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
