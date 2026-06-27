import { useState, useRef, useCallback, useEffect } from "react";

export type ToastType = "info" | "success" | "error" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  action?: { label: string; onClick: () => void };
  createdAt: number;
}

const MAX_VISIBLE = 3;

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", action?: { label: string; onClick: () => void }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newToast: ToastItem = { id, message, type, action, createdAt: Date.now() };
      setToasts((prev) => [...prev, newToast]);

      const duration = type === "error" ? 6000 : 4000;
      const timer = window.setTimeout(() => {
        removeToast(id);
      }, duration);
      timersRef.current.set(id, timer);
    },
    [removeToast]
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  // 只保留最近 MAX_VISIBLE 个，其余从队列中移除（视觉上隐藏，状态中保留用于动画）
  const visibleToasts = toasts.slice(-MAX_VISIBLE);

  return { toasts: visibleToasts, showToast, dismissToast: removeToast };
}
