import { useState, useRef, useEffect, useCallback } from "react";

export function useToast() {
  const [toast, setToast] = useState<{ visible: boolean; message: string }>({
    visible: false,
    message: "",
  });
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ visible: true, message });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast({ visible: false, message: "" });
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  return { toast, showToast };
}
