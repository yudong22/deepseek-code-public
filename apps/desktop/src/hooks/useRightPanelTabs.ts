import React, { useState } from "react";
import { bridge } from "@/bridge";

export interface Tab {
  id: string;
  title: string;
  type: string;
  content: string;
  language?: string;
}

interface UseRightPanelTabsProps {
  setIsRightSidebarOpen: (open: boolean) => void;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
}

export function useRightPanelTabs({
  setIsRightSidebarOpen,
  activeTabId,
  setActiveTabId,
}: UseRightPanelTabsProps) {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: "overview", title: "Overview", type: "overview", content: "" }
  ]);

  const openTab = (tab: Tab) => {
    setTabs((prev) => {
      if (prev.some((t) => t.id === tab.id)) {
        return prev;
      }
      const titleIdx = prev.findIndex((t) => t.title === tab.title);
      if (titleIdx > -1) {
        const next = [...prev];
        next[titleIdx] = tab;
        return next;
      }
      return [...prev, tab];
    });
    setActiveTabId(tab.id);
    setIsRightSidebarOpen(true);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabId === "overview") return;
    setTabs((prev) => {
      const nextTabs = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        const last = nextTabs[nextTabs.length - 1];
        setActiveTabId(last ? last.id : "overview");
      }
      return nextTabs;
    });
  };

  const readAndPreviewFile = async (relativePath: string) => {
    try {
      const ext = relativePath.split(".").pop()?.toLowerCase() || "text";
      const imageExts = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);

      if (imageExts.has(ext)) {
        const url = await bridge.getFileUrl(relativePath);
        if (url) {
          openTab({
            id: `file-${relativePath}`,
            title: relativePath,
            type: "image",
            content: url,
            language: ext,
          });
        }
      } else {
        const content = await bridge.readFile(relativePath);
        openTab({
          id: `file-${relativePath}`,
          title: relativePath,
          type: "tool_result",
          content,
          language: ext,
        });
      }
    } catch (err) {
      console.error("预览文件失败:", err);
    }
  };

  return {
    tabs,
    setTabs,
    openTab,
    closeTab,
    readAndPreviewFile,
  };
}
