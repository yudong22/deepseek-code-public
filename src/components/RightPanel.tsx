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
}

export default function RightPanel({ isOpen, tabs, activeTabId, messages }: RightPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  if (activeTab.type === "overview") {
    const assistantMessages = messages.filter((m) => m.role === "assistant");
    const latestAssistantMessage = assistantMessages.length > 0 ? assistantMessages[assistantMessages.length - 1] : null;
    const rightPanelMarkdownContent = latestAssistantMessage ? latestAssistantMessage.content : "";

    if (rightPanelMarkdownContent) {
      return (
        <aside className={`right-panel ${isOpen ? "" : "collapsed"}`}>
          <div className="right-panel-markdown" style={{ height: "100%", boxSizing: "border-box" }}>
            {renderMarkdown(rightPanelMarkdownContent)}
          </div>
        </aside>
      );
    }

    return (
      <aside className={`right-panel ${isOpen ? "" : "collapsed"}`}>
        <div className="right-panel-empty" style={{ height: "100%" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>No document generated yet.</span>
        </div>
      </aside>
    );
  }

  // 工具结果展示
  return (
    <aside className={`right-panel ${isOpen ? "" : "collapsed"}`}>
      <div className="right-panel-content" style={{ padding: "16px", height: "100%", boxSizing: "border-box", overflow: "hidden" }}>
        <pre style={{
          margin: 0,
          padding: "16px",
          background: "#f6f8fa",
          borderRadius: "6px",
          border: "1px solid #d0d7de",
          overflow: "auto",
          height: "100%",
          boxSizing: "border-box",
          fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: "12px",
          lineHeight: "1.5",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all"
        }}>
          <code>{activeTab.content}</code>
        </pre>
      </div>
    </aside>
  );
}
