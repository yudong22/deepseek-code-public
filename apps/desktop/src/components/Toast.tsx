import type { ToastItem, ToastType } from "@/hooks/useToast";

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

const typeStyles: Record<ToastType, { bg: string; border: string; bar: string; icon: string }> = {
  info: {
    bg: "bg-white dark:bg-surface-secondary",
    border: "border-zinc-200 dark:border-zinc-700",
    bar: "bg-brand-blue",
    icon: "ℹ️",
  },
  success: {
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-200 dark:border-emerald-800",
    bar: "bg-emerald-500",
    icon: "✅",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/30",
    border: "border-red-200 dark:border-red-800",
    bar: "bg-red-500",
    icon: "❌",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-800",
    bar: "bg-amber-500",
    icon: "⚠️",
  },
};

export default function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 flex flex-col-reverse gap-2 z-[9999] pointer-events-none">
      {toasts.map((toast) => {
        const styles = typeStyles[toast.type];
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-stretch gap-0 rounded-lg border shadow-lg text-sm max-w-[360px] animate-[toast-in_0.2s_ease-out] ${styles.bg} ${styles.border}`}
            role="alert"
          >
            {/* 类型色条 */}
            <div className={`w-[3px] rounded-l-lg shrink-0 ${styles.bar}`} />
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 flex-1">
              <span className="text-[15px] leading-none shrink-0 mt-px">{styles.icon}</span>
              <span className="text-zinc-800 dark:text-zinc-200 leading-snug flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  onClick={toast.action.onClick}
                  className="text-xs font-medium text-brand-blue dark:text-deepseek-400 hover:underline shrink-0"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0 ml-1"
                aria-label="关闭通知"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 3l8 8M11 3l-8 8" />
                </svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
