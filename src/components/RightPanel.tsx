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

  const nightClass = isNightMode ? "night-mode" : "";

  // 1. Overview — show latest assistant markdown
  if (activeTab.type === "overview") {
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const latestAssistantMessage =
      assistantMessages.length > 0
        ? assistantMessages[assistantMessages.length - 1]
        : null;
    const rightPanelMarkdownContent = latestAssistantMessage
      ? latestAssistantMessage.content
      : "";

    return (
      <aside
        className={`right-panel ${isOpen ? "" : "collapsed"} ${nightClass}`}
        style={isOpen ? { width } : undefined}
      >
        <div className="right-panel-resize-handle" onMouseDown={handleMouseDown} />
        {rightPanelMarkdownContent ? (
          <div
            className="right-panel-markdown"
            style={{ height: "100%", boxSizing: "border-box", overflow: "auto" }}
          >
            {renderMarkdown(rightPanelMarkdownContent)}
          </div>
        ) : (
          <div className="right-panel-empty" style={{ height: "100%" }}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.5 }}
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

  // 3. Markdown file — source/preview toggle
  if (isMarkdown) {
    return (
      <MarkdownPanel
        isOpen={isOpen}
        activeTab={activeTab}
        width={width}
        nightClass={nightClass}
        handleMouseDown={handleMouseDown}
      />
    );
  }

  // 4. Bash terminal style
  if (isBash) {
    return (
      <aside
        className={`right-panel ${isOpen ? "" : "collapsed"} ${nightClass}`}
        style={isOpen ? { width } : undefined}
      >
        <div className="right-panel-resize-handle" onMouseDown={handleMouseDown} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "16px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: "#18181b",
              borderRadius: "8px",
              border: "1px solid #27272a",
              height: "100%",
              overflow: "hidden",
              boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
            }}
          >
            {/* 终端标题栏 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 14px",
                background: "#202023",
                borderBottom: "1px solid #27272a",
                userSelect: "none",
              }}
            >
              <div style={{ display: "flex", gap: "6px", marginRight: "16px" }}>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#ff5f56",
                  }}
                />
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#ffbd2e",
                  }}
                />
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    borderRadius: "50%",
                    background: "#27c93f",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "11px",
                  color: "#a1a1aa",
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  fontWeight: 500,
                  margin: "0 auto",
                  transform: "translateX(-24px)",
                }}
              >
                {activeTab.title} (bash)
              </span>
            </div>
            {/* 终端内容区 */}
            <pre
              style={{
                margin: 0,
                padding: "16px",
                overflow: "auto",
                flex: 1,
                fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                fontSize: "12px",
                lineHeight: "1.6",
                color: "#e4e4e7",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              <code>{activeTab.content}</code>
            </pre>
          </div>
        </div>
      </aside>
    );
  }

  // 5. Regular source file — light themed, matching tool area style
  return (
    <FilePanel
      isOpen={isOpen}
      activeTab={activeTab}
      width={width}
      nightClass={nightClass}
      handleMouseDown={handleMouseDown}
    />
  );
}

// ─── Markdown panel with inner Preview / Source tabs ─────────────────────────

function MarkdownPanel({
  isOpen,
  activeTab,
  width,
  nightClass,
  handleMouseDown,
}: {
  isOpen: boolean;
  activeTab: Tab;
  width: number;
  nightClass: string;
  handleMouseDown: (e: React.MouseEvent) => void;
}) {
  const [activeInnerTab, setActiveInnerTab] = useState<"preview" | "source">("preview");
  const codeLines = activeTab.content.split("\n");
  if (codeLines.length > 1 && codeLines[codeLines.length - 1].trim() === "") {
    codeLines.pop();
  }

  return (
    <aside
      className={`right-panel ${isOpen ? "" : "collapsed"} ${nightClass}`}
      style={isOpen ? { width } : undefined}
    >
      <div className="right-panel-resize-handle" onMouseDown={handleMouseDown} />

      {/* 文件名头部 */}
      <div className="rp-file-header">
        <span className="rp-file-icon">📄</span>
        <span className="rp-file-name">{activeTab.title}</span>
        <span className="rp-file-lang">md</span>
      </div>

      {/* 内部 Tab 栏：Preview / Source */}
      <div className="rp-inner-tabs">
        <button
          className={`rp-inner-tab ${activeInnerTab === "preview" ? "active" : ""}`}
          onClick={() => setActiveInnerTab("preview")}
        >
          Preview
        </button>
        <button
          className={`rp-inner-tab ${activeInnerTab === "source" ? "active" : ""}`}
          onClick={() => setActiveInnerTab("source")}
        >
          Source
        </button>
      </div>

      {/* 内容区 */}
      <div className="rp-file-body">
        {activeInnerTab === "source" ? (
          <div className="rp-source-view">
            <div className="rp-line-numbers">
              {codeLines.map((_, idx) => (
                <div key={idx}>{idx + 1}</div>
              ))}
            </div>
            <pre className="rp-code-content">
              <code>{activeTab.content}</code>
            </pre>
          </div>
        ) : (
          <div
            className="right-panel-markdown"
            style={{ flex: 1, overflow: "auto" }}
          >
            {renderMarkdown(activeTab.content)}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Regular file panel (light-themed) ───────────────────────────────────────

function FilePanel({
  isOpen,
  activeTab,
  width,
  nightClass,
  handleMouseDown,
}: {
  isOpen: boolean;
  activeTab: Tab;
  width: number;
  nightClass: string;
  handleMouseDown: (e: React.MouseEvent) => void;
}) {
  const codeLines = activeTab.content.split("\n");
  if (codeLines.length > 1 && codeLines[codeLines.length - 1].trim() === "") {
    codeLines.pop();
  }

  return (
    <aside
      className={`right-panel ${isOpen ? "" : "collapsed"} ${nightClass}`}
      style={isOpen ? { width } : undefined}
    >
      <div className="right-panel-resize-handle" onMouseDown={handleMouseDown} />
      <div className="rp-file-header">
        <span className="rp-file-icon">📄</span>
        <span className="rp-file-name">{activeTab.title}</span>
        <span className="rp-file-lang">{activeTab.language || "text"}</span>
      </div>
      <div className="rp-file-body">
        <div className="rp-source-view">
          <div className="rp-line-numbers">
            {codeLines.map((_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>
          <pre className="rp-code-content">
            <code>{activeTab.content}</code>
          </pre>
        </div>
      </div>
    </aside>
  );
}
