import { useEffect, useRef, useState } from "react";
import { Message } from "@/bridge";
import { renderMarkdown } from "@/utils/markdown";
import * as Icons from "@/components/Icons";
import { ToolCallGroup } from "@/components/ToolCallCard";

interface ChatFeedProps {
  messages: Message[];
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  isGenerating?: boolean;
  onCancelAgent?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}

interface ThinkingBlockProps {
  content: string;
  isGenerating: boolean;
  isLastMessage: boolean;
}

function ThinkingBlock({ content, isGenerating, isLastMessage }: ThinkingBlockProps) {
  const isStreaming = isGenerating && isLastMessage;
  const [expanded, setExpanded] = useState(true);

  // 当生成结束时自动折叠
  useEffect(() => {
    if (!isStreaming) {
      setExpanded(false);
    }
  }, [isStreaming]);

  // 把思维内容按行拆分，每行加 ∴ 前缀
  const lines = content
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => l.trimEnd());

  return (
    <div
      className="thinking-block"
      onClick={() => setExpanded((v) => !v)}
    >
      {expanded ? (
        /* 展开：每行显示 ∴ 前缀 */
        <div className="thinking-lines">
          {lines.map((line, i) => (
            <div key={i} className="thinking-line">
              <span className="thinking-prefix">∴</span>
              <span className="thinking-text">{line}</span>
            </div>
          ))}
          {/* 流式输入中的闪烁光标 */}
          {isStreaming && (
            <div className="thinking-line">
              <span className="thinking-prefix">∴</span>
              <span className="thinking-cursor" />
            </div>
          )}
        </div>
      ) : (
        /* 折叠：单行摘要 */
        <div className="thinking-line thinking-collapsed">
          <span className="thinking-prefix">∴</span>
          <span className="thinking-summary">
            {lines[0]
              ? lines[0].length > 60
                ? lines[0].slice(0, 60) + "…"
                : lines[0]
              : "Thinking…"}
          </span>
          <span className="thinking-meta">
            {lines.length} lines · click to expand
          </span>
        </div>
      )}
    </div>
  );
}

export default function ChatFeed({ messages, onOpenTab, isGenerating, onCancelAgent, readFile, getFileUrl }: ChatFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickyUserMsg, setStickyUserMsg] = useState<string | null>(null);

  // 自动滚动到底部 — 仅当用户已经在底部附近时才跟随
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    // 只有当用户距底部 200px 以内时，才自动跟随滚动
    if (distanceFromBottom < 200) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // 滚动监听：确定置顶哪条 user 消息
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      // 距顶部很近时（< 80px）隐藏置顶栏，避免抖动
      if (scrollTop < 80) {
        setStickyUserMsg(null);
        return;
      }

      // 找出最近一条已经滚过的 user 消息
      const wrappers = container.querySelectorAll<HTMLElement>("[data-msg-id]");
      let activeUserId: string | null = null;

      for (let i = 0; i < wrappers.length; i++) {
        const el = wrappers[i];
        if (el.dataset.role === "user" && el.offsetTop <= scrollTop + 60) {
          activeUserId = el.dataset.msgId || null;
        }
      }
      setStickyUserMsg(activeUserId);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [messages]);

  // 找出置顶消息的内容
  const stickyMsg = stickyUserMsg
    ? messages.find((m) => m.id === stickyUserMsg && m.role === "user")
    : null;

  return (
    <div className="chat-feed-container">
      {/* 置顶 user 消息（悬浮定位，不占滚动容器空间，消除抖动） */}
      {stickyMsg && (
        <div className="sticky-user-bar">
          <span className="sticky-user-bar-icon">💬</span>
          <span className="sticky-user-bar-text">{stickyMsg.content}</span>
        </div>
      )}

      <div className="chat-messages-feed" ref={containerRef}>
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;

          return (
            <div
              key={msg.id}
              className={`message-wrapper ${msg.role}`}
              data-msg-id={msg.id}
              data-role={msg.role}
            >
              {msg.role === "user" ? (
                <div className="message-bubble-user">
                  {msg.content}
                </div>
              ) : msg.role === "tool" ? (
                /* tool 角色消息（旧格式兼容，基本不使用） */
                <div className="message-tool-log" style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 12px",
                  margin: "6px 0",
                  fontSize: "12px",
                  color: "#8a8a8f",
                  background: "rgba(0, 0, 0, 0.02)",
                  borderRadius: "6px",
                  borderLeft: "2px solid #8e8e93"
                }}>
                  <span style={{ fontSize: "14px" }}>⚙️</span>
                  <span><strong>工具执行完成</strong></span>
                  <details style={{ marginLeft: "auto", cursor: "pointer" }}>
                    <summary style={{ outline: "none", color: "#007aff", fontSize: "11px" }}>查看输出</summary>
                    <pre style={{
                      marginTop: "6px",
                      background: "#f8f8f8",
                      padding: "8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      color: "#333",
                      maxHeight: "200px",
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all"
                    }}>{msg.content}</pre>
                  </details>
                </div>
              ) : (
                <>
                  <div className="message-body">
                    {/* 思维链展示 */}
                    {msg.reasoning_content !== undefined && (
                      <ThinkingBlock
                        content={msg.reasoning_content}
                        isGenerating={!!isGenerating}
                        isLastMessage={isLastMessage}
                      />
                    )}

                    {/* 工具调用组 — 渲染在文本之前（工具在文本生成前执行）*/}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div className="message-tool-calls-list">
                        <ToolCallGroup
                          toolCalls={msg.toolCalls}
                          messageId={msg.id}
                          onOpenTab={onOpenTab}
                          onCancel={isGenerating && isLastMessage ? onCancelAgent : undefined}
                          readFile={readFile}
                          getFileUrl={getFileUrl}
                        />
                      </div>
                    )}

                    {/* 实质性的文本总结前加圆点分隔（排除短确认）*/}
                    {msg.toolCalls && msg.toolCalls.length > 0 && msg.content && msg.content.length > 80 && (
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        margin: "4px 0",
                        fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
                      }}>
                        <span style={{
                          color: "inherit",
                          fontSize: "14px",
                          lineHeight: 1,
                          userSelect: "none",
                          flexShrink: 0,
                        }}>•</span>
                      </div>
                    )}

                    {renderMarkdown(msg.content)}
                  </div>

                  <div className="message-footer">
                    <span>{new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>
                    <button className="message-action-icon"><Icons.Like /></button>
                    <button className="message-action-icon"><Icons.Dislike /></button>
                    <button className="message-action-icon"><Icons.Copy /></button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
