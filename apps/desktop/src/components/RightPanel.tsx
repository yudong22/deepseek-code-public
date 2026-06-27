import React, { useState, useRef, useCallback, useEffect } from "react";
import { Message } from "@/bridge";
import { renderMarkdown } from "@/utils/markdown";

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
        className={`flex flex-col bg-white dark:bg-[#1c1c1e] h-full shrink-0 relative transition-all duration-200 border-l border-[#e3e3e3] dark:border-[#2c2c2e] overflow-hidden ${
          isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
        }`}
        style={panelStyles}
      >
        <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
        {rightPanelMarkdownContent ? (
          <div className="p-5 text-zinc-800 dark:text-[#f5f5f7] leading-relaxed overflow-y-auto h-full box-border">
            {renderMarkdown(rightPanelMarkdownContent)}
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
        className={`flex flex-col bg-white dark:bg-[#1c1c1e] h-full shrink-0 relative transition-all duration-200 border-l border-[#e3e3e3] dark:border-[#2c2c2e] overflow-hidden ${
          isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
        }`}
        style={panelStyles}
      >
        <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
        <div className="flex items-center gap-1.5 px-4 h-8 bg-[#f6f6f6] dark:bg-[#1c1c1e] border-b border-[#e3e3e3] dark:border-[#2c2c2e] shrink-0 text-xs text-zinc-500 select-none">
          <span className="text-sm">🖼️</span>
          <span className="font-semibold text-zinc-800 dark:text-[#f5f5f7] truncate max-w-[200px]">{activeTab.title}</span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-[#efeff4] dark:bg-[#2c2c2e] px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">{activeTab.language || "image"}</span>
        </div>
        <div 
          className="flex-1 overflow-auto flex items-center justify-center p-4"
          style={{
            background: isNightMode ? "#1c1c1e" : "#f5f5f7",
          }}
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
      />
    );
  }

  // 4. Bash terminal style
  if (isBash) {
    return (
      <aside
        className={`flex flex-col bg-white dark:bg-[#1c1c1e] h-full shrink-0 relative transition-all duration-200 border-l border-[#e3e3e3] dark:border-[#2c2c2e] overflow-hidden ${
          isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
        }`}
        style={panelStyles}
      >
        <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
        <div className="flex flex-col h-full p-4 box-border">
          <div className="flex flex-col bg-[#18181b] rounded-lg border border-[#27272a] h-full overflow-hidden shadow-xl">
            {/* 终端标题栏 */}
            <div className="flex items-center px-3.5 py-2.5 bg-[#202023] border-b border-[#27272a] select-none">
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
            <pre className="m-0 p-4 overflow-auto flex-1 font-mono text-[12px] leading-relaxed text-[#e4e4e7] whitespace-pre-wrap break-all">
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
}: {
  isOpen: boolean;
  activeTab: Tab;
  width: number;
  handleMouseDown: (e: React.MouseEvent) => void;
}) {
  const [activeInnerTab, setActiveInnerTab] = useState<"preview" | "source">("preview");
  const codeLines = activeTab.content.split("\n");
  if (codeLines.length > 1 && codeLines[codeLines.length - 1].trim() === "") {
    codeLines.pop();
  }

  return (
    <aside
      className={`flex flex-col bg-white dark:bg-[#1c1c1e] h-full shrink-0 relative transition-all duration-200 border-l border-[#e3e3e3] dark:border-[#2c2c2e] overflow-hidden ${
        isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
      }`}
      style={isOpen ? { width } : undefined}
    >
      <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />

      {/* 文件名头部 */}
      <div className="flex items-center gap-1.5 px-4 h-8 bg-[#f6f6f6] dark:bg-[#1c1c1e] border-b border-[#e3e3e3] dark:border-[#2c2c2e] shrink-0 text-xs text-zinc-500 select-none">
        <span className="text-sm">📄</span>
        <span className="font-semibold text-zinc-800 dark:text-[#f5f5f7] truncate max-w-[200px]">{activeTab.title}</span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-[#efeff4] dark:bg-[#2c2c2e] px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">md</span>
      </div>

      {/* 内部 Tab 栏：Preview / Source */}
      <div className="flex items-center gap-1 px-4 h-8 bg-[#f6f6f6] dark:bg-[#1c1c1e] border-b border-[#e3e3e3] dark:border-[#2c2c2e] shrink-0">
        <button
          className={`px-3 h-6 rounded-md text-xs font-semibold cursor-pointer border-0 bg-transparent transition-colors ${
            activeInnerTab === "preview" 
              ? "bg-white dark:bg-[#2c2c2e] text-[#111] dark:text-white shadow-sm" 
              : "text-zinc-500 hover:bg-[#efeff4] dark:hover:bg-[#2c2c2e]"
          }`}
          onClick={() => setActiveInnerTab("preview")}
        >
          Preview
        </button>
        <button
          className={`px-3 h-6 rounded-md text-xs font-semibold cursor-pointer border-0 bg-transparent transition-colors ${
            activeInnerTab === "source" 
              ? "bg-white dark:bg-[#2c2c2e] text-[#111] dark:text-white shadow-sm" 
              : "text-zinc-500 hover:bg-[#efeff4] dark:hover:bg-[#2c2c2e]"
          }`}
          onClick={() => setActiveInnerTab("source")}
        >
          Source
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeInnerTab === "source" ? (
          <div className="flex-1 overflow-auto flex items-stretch font-mono text-[11px] leading-relaxed bg-[#f9f9fb] dark:bg-[#18181b]">
            <div className="py-3 px-2 text-right text-zinc-450 dark:text-zinc-650 bg-zinc-50 dark:bg-[#161618] border-r border-[#e3e3e3] dark:border-[#202022] min-w-[32px] select-none">
              {codeLines.map((_, idx) => (
                <div key={idx}>{idx + 1}</div>
              ))}
            </div>
            <pre className="py-3 px-4 overflow-x-auto text-zinc-800 dark:text-[#e4e4e7] flex-1 m-0">
              <code>{activeTab.content}</code>
            </pre>
          </div>
        ) : (
          <div className="p-5 text-zinc-800 dark:text-[#f5f5f7] leading-relaxed overflow-y-auto flex-1">
            {renderMarkdown(activeTab.content)}
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
  const codeLines = activeTab.content.split("\n");
  if (codeLines.length > 1 && codeLines[codeLines.length - 1].trim() === "") {
    codeLines.pop();
  }

  return (
    <aside
      className={`flex flex-col bg-white dark:bg-[#1c1c1e] h-full shrink-0 relative transition-all duration-200 border-l border-[#e3e3e3] dark:border-[#2c2c2e] overflow-hidden ${
        isOpen ? "" : "w-0 border-l-transparent pointer-events-none"
      }`}
      style={isOpen ? { width } : undefined}
    >
      <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors" onMouseDown={handleMouseDown} />
      <div className="flex items-center gap-1.5 px-4 h-8 bg-[#f6f6f6] dark:bg-[#1c1c1e] border-b border-[#e3e3e3] dark:border-[#2c2c2e] shrink-0 text-xs text-zinc-500 select-none">
        <span className="text-sm">📄</span>
        <span className="font-semibold text-zinc-800 dark:text-[#f5f5f7] truncate max-w-[200px]">{activeTab.title}</span>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-[#efeff4] dark:bg-[#2c2c2e] px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">{activeTab.language || "text"}</span>
      </div>
      <div className="flex-1 overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto flex items-stretch font-mono text-[11px] leading-relaxed bg-[#f9f9fb] dark:bg-[#18181b]">
          <div className="py-3 px-2 text-right text-zinc-450 dark:text-zinc-650 bg-zinc-50 dark:bg-[#161618] border-r border-[#e3e3e3] dark:border-[#202022] min-w-[32px] select-none">
            {codeLines.map((_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>
          <pre className="py-3 px-4 overflow-x-auto text-zinc-800 dark:text-[#e4e4e7] flex-1 m-0">
            <code>{activeTab.content}</code>
          </pre>
        </div>
      </div>
    </aside>
  );
}
