import { useState, useRef, useEffect, useCallback } from "react";

export function useToast() {
  const [toast, setToast] = useState<{ visible: boolean; message: string; onClick?: () => void }>({
    visible: false,
    message: "",
  });
  const toastTimeoutRef = useRef<number | null>(null);

  const showToast = useCallback((message: string, onClick?: () => void) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ visible: true, message, onClick });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast({ visible: false, message: "", onClick: undefined });
    }, 3000);
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
