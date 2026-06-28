import { useState } from "react";
import { bridge } from "@/bridge";
import type { Tab } from "@/components/RightPanel/PanelShell";
export type { Tab };

interface UseRightPanelTabsProps {
  setIsRightSidebarOpen: (open: boolean) => void;
  activeTabId: string;
  setActiveTabId: (id: string) => void;
}

/** 把"相对于当前文件"的链接解析成"相对于 workspace 根"的路径。
 *  - 如果是绝对路径（以 / 开头），去掉前导斜杠
 *  - 如果是相对路径，基于 sourcePath 的目录拼接
 *  - 支持 ../ 和 ./ 语法 */
function resolveRelativeLink(sourcePath: string | undefined, linkPath: string): string {
  const normalized = linkPath.replace(/^\/+/, "");
  if (!sourcePath) return normalized;
  const baseDir = sourcePath.split("/").slice(0, -1).join("/");
  // 正确地拼接目录 + 链接的各段
  const allParts = (baseDir ? baseDir.split("/") : []).concat(normalized.split("/"));
  const resolved: string[] = [];
  for (const p of allParts) {
    if (p === "" || p === ".") continue;
    if (p === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(p);
  }
  return resolved.join("/");
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

  /** 预览一个文件：linkPath 是相对当前文件的路径，sourceFilePath 是当前 markdown 所属文件
   *  （workspace 相对）。通过 resolveRelativeLink 把 linkPath 解析为相对 workspace 根的路径。 */
  const readAndPreviewFile = async (linkPath: string, sourceFilePath?: string) => {
    const relativePath = resolveRelativeLink(sourceFilePath, linkPath);
    const ext = relativePath.split(".").pop()?.toLowerCase() || "text";
    const isImage = /^(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/.test(ext);

    const openError = (msg: string) => {
      openTab({
        id: `file-${relativePath}`,
        title: relativePath,
        type: "tool_result",
        content: `❌ **无法预览文件**\n\n\`${relativePath}\`\n\n错误：${msg}`,
        language: "text",
        sourcePath: relativePath,
      });
    };

    try {
      if (isImage) {
        const url = await bridge.getFileUrl(relativePath);
        if (!url) throw new Error("无法加载图片");
        openTab({
          id: `file-${relativePath}`,
          title: relativePath,
          type: "image",
          content: url,
          language: ext,
          sourcePath: relativePath,
        });
        return;
      }
      const content = await bridge.readFile(relativePath);
      // bridge.readFile 在失败时返回 "Error: ..." 字符串，转为异常以便走统一错误分支
      if (content.startsWith("Error:")) throw new Error(content);
      openTab({
        id: `file-${relativePath}`,
        title: relativePath,
        type: "tool_result",
        content,
        language: ext,
        sourcePath: relativePath,
      });
    } catch (err: any) {
      openError(err?.message || String(err));
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
