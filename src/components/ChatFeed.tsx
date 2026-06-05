import { useEffect, useRef, useState } from "react";
import { Message } from "@/bridge";
import { renderMarkdown } from "@/utils/markdown";
import * as Icons from "@/components/Icons";
import { ToolCallGroup } from "@/components/ToolCallCard";

interface ChatFeedProps {
  messages: Message[];
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
}

export default function ChatFeed({ messages, onOpenTab }: ChatFeedProps) {
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
        {messages.map((msg) => (
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
                  {msg.reasoning_content && (
                    <div className="message-reasoning-block" style={{
                      background: "rgba(0, 0, 0, 0.02)",
                      borderLeft: "3px solid #8e8e93",
                      padding: "8px 12px",
                      marginBottom: "12px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      color: "#555"
                    }}>
                      <div style={{ fontWeight: "600", fontSize: "11px", color: "#8e8e93", marginBottom: "4px" }}>思维链 (Thinking):</div>
                      <div style={{ whiteSpace: "pre-wrap" }}>{msg.reasoning_content}</div>
                    </div>
                  )}

                  {/* 工具调用组 — 渲染在文本之前（工具在文本生成前执行）*/}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="message-tool-calls-list">
                      <ToolCallGroup
                        toolCalls={msg.toolCalls}
                        messageId={msg.id}
                        onOpenTab={onOpenTab}
                      />
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
        ))}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}
