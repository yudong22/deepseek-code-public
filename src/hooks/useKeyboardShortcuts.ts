import { useEffect, useRef } from "react";
import { Message } from "@/bridge";

interface KeyboardShortcutsProps {
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  isRightSidebarOpen: boolean;
  setIsRightSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  isLeftSidebarOpen: boolean;
  setIsLeftSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  setTabs: (tabs: any[]) => void;
  setActiveTabId: (id: string) => void;
  messages: Message[];
  showToast: (msg: string) => void;
  navigate: (path: string | number) => void;
}

export function useKeyboardShortcuts({
  isSettingsOpen,
  setIsSettingsOpen,
  isRightSidebarOpen,
  setIsRightSidebarOpen,
  isLeftSidebarOpen,
  setIsLeftSidebarOpen,
  setTabs,
  setActiveTabId,
  messages,
  showToast,
  navigate,
}: KeyboardShortcutsProps) {
  const propsRef = useRef({
    isSettingsOpen,
    setIsSettingsOpen,
    isRightSidebarOpen,
    setIsRightSidebarOpen,
    isLeftSidebarOpen,
    setIsLeftSidebarOpen,
    setTabs,
    setActiveTabId,
    messages,
    showToast,
    navigate,
  });

  // Keep ref updated with latest props to avoid event handler stale closure issues
  useEffect(() => {
    propsRef.current = {
      isSettingsOpen,
      setIsSettingsOpen,
      isRightSidebarOpen,
      setIsRightSidebarOpen,
      isLeftSidebarOpen,
      setIsLeftSidebarOpen,
      setTabs,
      setActiveTabId,
      messages,
      showToast,
      navigate,
    };
  }, [
    isSettingsOpen,
    setIsSettingsOpen,
    isRightSidebarOpen,
    setIsRightSidebarOpen,
    isLeftSidebarOpen,
    setIsLeftSidebarOpen,
    setTabs,
    setActiveTabId,
    messages,
    showToast,
    navigate,
  ]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const {
        isSettingsOpen: settingsOpen,
        setIsSettingsOpen: setSettingsOpen,
        isRightSidebarOpen: rightOpen,
        setIsRightSidebarOpen: setRightOpen,
        setIsLeftSidebarOpen: setLeftOpen,
        setTabs: changeTabs,
        setActiveTabId: changeActiveTab,
        messages: currentMsgs,
        showToast: toastMsg,
        navigate: navTo,
      } = propsRef.current;

      const mod = e.metaKey || e.ctrlKey;

      if (e.key === "Escape" && !mod) {
        if (settingsOpen) {
          e.preventDefault();
          setSettingsOpen(false);
          return;
        }
        if (rightOpen) {
          e.preventDefault();
          changeTabs([{ id: "overview", title: "Overview", type: "overview", content: "" }]);
          changeActiveTab("overview");
          setRightOpen(false);
          return;
        }
      }

      if (mod) {
        switch (e.code) {
          case "KeyN":
            e.preventDefault();
            navTo("/");
            return;
          case "Comma":
            e.preventDefault();
            setSettingsOpen(true);
            return;
          case "KeyL":
            e.preventDefault();
            document.querySelector<HTMLTextAreaElement>(".chat-input-textarea")?.focus();
            return;
          case "KeyB":
            e.preventDefault();
            setLeftOpen((v) => !v);
            return;
          case "Backslash":
            e.preventDefault();
            setRightOpen((v) => !v);
            return;
          case "KeyC":
            if (e.shiftKey) {
              e.preventDefault();
              const lastAssistant = [...currentMsgs].reverse().find((m) => m.role === "assistant");
              if (lastAssistant) {
                navigator.clipboard.writeText(lastAssistant.content).then(() => {
                  toastMsg("已复制到剪贴板");
                });
              }
            }
            return;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}
