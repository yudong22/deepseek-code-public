import React, { useState, useRef, useCallback, useEffect } from "react";
import { Message } from "@/bridge";
import { renderMarkdown, renderCodeBlock, CodeBlockCopyButton, CodeBlockDownloadButton } from "@/utils/markdown";

interface Tab {
  id: string;
  title: string;
  type: string;
  content: string;
  language?: string;
}

interface RightPanelProps {
  isOpen: boolean;
  tabs: Tab[];
  activeTabId: string;
  messages: Message[];
  width: number;
  onWidthChange: (w: number) => void;
  isNightMode: boolean;
  /** 点击 markdown 中 file:// 链接时调用（递归预览） */
  onPreviewFile?: (relativePath: string) => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 900;

export default function RightPanel({
  isOpen,
  tabs,
  activeTabId,
  messages,
  width,
  onWidthChange,
  isNightMode,
  onPreviewFile,
}: RightPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // --- Resizable logic ---
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(width);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isOpen) return;
      isDragging.current = true;
      startX.current = e.clientX;
      startWidth.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [isOpen, width]
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX; // drag left = wider
      const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth.current + delta));
      onWidthChange(newW);
    };
    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onWidthChange]);

  const panelStyles = isOpen ? { width } : undefined;

  // 1. Overview — show latest assistant markdown
  if (activeTab.type === "overview") {
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const latestAssistantMessage =
      assistantMessages.length > 0
        ? assistantMessages[assistantMessages.length - 1]
        : null;
    let rightPanelMarkdownContent = latestAssistantMessage
      ? latestAssistantMessage.content
      : "";

    // Strip trailing stats block if present
    if (rightPanelMarkdownContent) {
      rightPanelMarkdownContent = rightPanelMarkdownContent.replace(/\n\n---\n\*[\s\S]+\*$/, "");
    }

    return (
      <aside
        className={`flex flex-col bg-white dark:bg-surface-primary h-full shrink-0 relative transition-all duration-200 border-l border-border-primary overflow-hidden ${
          isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
        }`}
        style={panelStyles}
      >
        <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
        {rightPanelMarkdownContent ? (
          <div className="p-5 text-zinc-800 dark:text-label-primary leading-relaxed overflow-y-auto h-full box-border">
            {renderMarkdown(rightPanelMarkdownContent, false, onPreviewFile)}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500 text-xs text-center h-full">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-50"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>No document generated yet.</span>
          </div>
        )}
      </aside>
    );
  }

  // 2. Detect file types
  const language = (activeTab.language || "").toLowerCase();
  const title = (activeTab.title || "").toLowerCase();
  const isMarkdown =
    ["md", "markdown"].includes(language) || title.endsWith(".md");
  const isBash =
    language === "bash" || title.includes("bash") || title.includes("command");
  const isImage = activeTab.type === "image" ||
    ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"].includes(language);

  // 2a. Image preview
  if (isImage) {
    return (
      <aside
        className={`flex flex-col bg-white dark:bg-surface-primary h-full shrink-0 relative transition-all duration-200 border-l border-border-primary overflow-hidden ${
          isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
        }`}
        style={panelStyles}
      >
        <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
        <div className="flex items-center gap-1.5 px-4 h-8 bg-surface-primary border-b border-border-primary shrink-0 text-xs text-zinc-500 select-none">
          <span className="text-sm">🖼️</span>
          <span className="font-semibold text-zinc-800 dark:text-label-primary truncate max-w-[200px]">{activeTab.title}</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-surface-secondary px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">{activeTab.language || "image"}</span>
        </div>
        <div
          className={`flex-1 overflow-auto flex items-center justify-center p-4 ${isNightMode ? "bg-[#1c1c1e]" : "bg-[#f5f5f7]"}`}
        >
          <img
            src={activeTab.content}
            alt={activeTab.title}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      </aside>
    );
  }

  // 3. Markdown file — source/preview toggle
  if (isMarkdown) {
    return (
    <MarkdownPanel
        isOpen={isOpen}
        activeTab={activeTab}
        width={width}
        handleMouseDown={handleMouseDown}
        onPreviewFile={onPreviewFile}
      />
    );
  }

  // 4. Bash terminal style
  if (isBash) {
    return (
      <aside
        className={`flex flex-col bg-white dark:bg-surface-primary h-full shrink-0 relative transition-all duration-200 border-l border-border-primary overflow-hidden ${
          isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
        }`}
        style={panelStyles}
      >
        <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
        <div className="flex flex-col h-full p-4 box-border">
          <div className="flex flex-col bg-surface-primary rounded-lg border border-border-primary h-full overflow-hidden shadow-xl">
            {/* 终端标题栏 */}
            <div className="flex items-center px-3.5 py-2.5 bg-surface-primary border-b border-border-primary select-none">
              <div className="flex gap-1.5 mr-4">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
              </div>
              <span className="text-[11px] color-[#a1a1aa] font-medium mx-auto -translate-x-6">
                {activeTab.title} (bash)
              </span>
            </div>
            {/* 终端内容区 */}
            <pre className="m-0 p-4 overflow-auto flex-1 font-mono text-[12px] leading-relaxed text-label-primary whitespace-pre-wrap break-all">
              <code>{activeTab.content}</code>
            </pre>
          </div>
        </div>
      </aside>
    );
  }

  // 5. Regular source file
  return (
    <FilePanel
      isOpen={isOpen}
      activeTab={activeTab}
      width={width}
      handleMouseDown={handleMouseDown}
    />
  );
}

// ─── Markdown panel with inner Preview / Source tabs ─────────────────────────

function MarkdownPanel({
  isOpen,
  activeTab,
  width,
  handleMouseDown,
  onPreviewFile,
}: {
  isOpen: boolean;
  activeTab: Tab;
  width: number;
  handleMouseDown: (e: React.MouseEvent) => void;
  onPreviewFile?: (file: any) => void;
}) {
  const [activeInnerTab, setActiveInnerTab] = useState<"preview" | "source">("preview");

  return (
    <aside
      className={`flex flex-col bg-white dark:bg-surface-primary h-full shrink-0 relative transition-all duration-200 border-l border-border-primary overflow-hidden ${
        isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
      }`}
      style={isOpen ? { width } : undefined}
    >
      <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />

      {/* 文件名头部 */}
      <div className="flex items-center gap-1.5 px-4 h-8 bg-surface-primary border-b border-border-primary shrink-0 text-xs text-zinc-500 select-none">
        <span className="text-sm">📄</span>
        <span className="font-semibold text-zinc-800 dark:text-label-primary truncate max-w-[200px]">{activeTab.title}</span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-surface-secondary px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">md</span>
      </div>

      {/* 内部 Tab 栏：Preview / Source + 复制/下载按钮 */}
      <div className="flex items-center gap-1 px-4 h-8 bg-surface-primary border-b border-border-primary shrink-0">
        <button
          className={`px-3 h-6 rounded-md text-xs font-semibold cursor-pointer border-0 bg-transparent transition-colors ${
            activeInnerTab === "preview" 
              ? "bg-white dark:bg-surface-secondary text-[#111] dark:text-white shadow-sm" 
              : "text-zinc-500 hover:bg-surface-secondary dark:hover:bg-surface-secondary"
          }`}
          onClick={() => setActiveInnerTab("preview")}
        >
          Preview
        </button>
        <button
          className={`px-3 h-6 rounded-md text-xs font-semibold cursor-pointer border-0 bg-transparent transition-colors ${
            activeInnerTab === "source" 
              ? "bg-white dark:bg-surface-secondary text-[#111] dark:text-white shadow-sm" 
              : "text-zinc-500 hover:bg-surface-secondary dark:hover:bg-surface-secondary"
          }`}
          onClick={() => setActiveInnerTab("source")}
        >
          Source
        </button>
        <div className="ml-auto flex items-center gap-1">
          <CodeBlockDownloadButton
            code={activeTab.content}
            language="markdown"
            className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title="下载文件"
          />
          <CodeBlockCopyButton
            code={activeTab.content}
            className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title="复制内容"
          />
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeInnerTab === "source" ? (
          <div className="sd-panel-code flex-1 overflow-auto">
            {renderCodeBlock(activeTab.content, "markdown")}
          </div>
        ) : (
          <div className="p-5 text-zinc-800 dark:text-label-primary leading-relaxed overflow-y-auto flex-1">
            {renderMarkdown(activeTab.content, false, onPreviewFile)}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Regular file panel ──────────────────────────────────────────────────────

function FilePanel({
  isOpen,
  activeTab,
  width,
  handleMouseDown,
}: {
  isOpen: boolean;
  activeTab: Tab;
  width: number;
  handleMouseDown: (e: React.MouseEvent) => void;
}) {
  // P1-1: 从 title 提取扩展名作为 language fallback
  const titleExt = (activeTab.title || "").split(".").pop()?.toLowerCase() || "";
  const language = activeTab.language || titleExt || "text";

  return (
    <aside
      className={`flex flex-col bg-white dark:bg-surface-primary h-full shrink-0 relative transition-all duration-200 border-l border-border-primary overflow-hidden ${
        isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
      }`}
      style={isOpen ? { width } : undefined}
    >
      <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
      {/* 顶部工具栏：文件名 + 语言标签 + 复制/下载按钮 */}
      <div className="flex items-center gap-1.5 px-4 h-9 bg-surface-primary border-b border-border-primary shrink-0 text-xs text-zinc-500 select-none">
        <span className="text-sm">📄</span>
        <span className="font-semibold text-zinc-800 dark:text-label-primary truncate max-w-[180px]">{activeTab.title}</span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-surface-secondary px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">{language}</span>
        <div className="ml-auto flex items-center gap-1">
          <CodeBlockDownloadButton
            code={activeTab.content}
            language={language}
            className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title="下载文件"
          />
          <CodeBlockCopyButton
            code={activeTab.content}
            className="p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
            title="复制代码"
          />
        </div>
      </div>
      {/* 代码内容：直接用 CodeBlock，它自带 shiki 高亮 + 行号 */}
      <div className="sd-panel-code flex-1 overflow-auto">
        {renderCodeBlock(activeTab.content, language)}
      </div>
    </aside>
  );
}

