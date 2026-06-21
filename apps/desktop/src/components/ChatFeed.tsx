import { useEffect, useRef, useState } from "react";
import { Message } from "@/bridge";
import { renderMarkdown } from "@/utils/markdown";
import * as Icons from "@/components/Icons";
import { ToolCallGroup } from "@/components/ToolCallCard";
import QuestionCard from "@/components/QuestionCard";

interface ChatFeedProps {
  messages: Message[];
  planMode?: boolean;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  isGenerating?: boolean;
  onCancelAgent?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
  showToast?: (message: string) => void;
  /** question 工具回答后的回调 */
  onAnswerQuestion?: () => void;
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

export default function ChatFeed({ messages, planMode, onOpenTab, isGenerating, onCancelAgent, readFile, getFileUrl, showToast }: ChatFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const [stickyUserMsg, setStickyUserMsg] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, "like" | "dislike" | null>>({});

  // 滚动监听：跟踪用户是否在底部（主动向上滚动即取消自动下滚）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      isUserAtBottomRef.current = dist < 50;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // 自动滚动到底部 — 仅当用户在底部时才跟随
  useEffect(() => {
    if (!isUserAtBottomRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (dist < 50) {
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

      {/* 规划模式横幅 */}
      {planMode && (
        <div className="plan-mode-banner">
          <span className="plan-mode-banner-icon">📋</span>
          <span>规划模式 — Agent 仅执行读取和分析，不会修改文件</span>
        </div>
      )}

      <div className="chat-messages-feed" ref={containerRef}>
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          const messageLiked = likes[msg.id] === "like";
          const messageDisliked = likes[msg.id] === "dislike";

          const handleLike = () => {
            setLikes((prev) => ({
              ...prev,
              [msg.id]: prev[msg.id] === "like" ? null : "like",
            }));
          };

          const handleDislike = () => {
            setLikes((prev) => ({
              ...prev,
              [msg.id]: prev[msg.id] === "dislike" ? null : "dislike",
            }));
          };

          const handleCopy = () => {
            navigator.clipboard.writeText(msg.content).then(() => {
              if (showToast) {
                showToast("已复制到剪贴板");
              }
            });
          };

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
                    {/* 有 sections 时按到达顺序渲染，否则降级为旧格式 */}
                    {msg.sections && msg.sections.length > 0 ? (
                      <>
                        {msg.sections.map((sec, si) => {
                          if (sec.type === "thinking") {
                            const tContent = sec.content || "";
                            const tElapsed = sec.elapsed;
                            const finalContent = tElapsed ? tContent + `\n⏱ ${tElapsed}s` : tContent;
                            return (
                              <ThinkingBlock
                                key={si}
                                content={finalContent}
                                isGenerating={!!isGenerating}
                                isLastMessage={isLastMessage && si === msg.sections!.length - 1}
                              />
                            );
                          }
                          if (sec.type === "tools" && sec.toolCalls && sec.toolCalls.length > 0) {
                            // 检测 question 工具调用→渲染交互式问答卡片
                            const questionTc = sec.toolCalls.find(tc => tc.name === "question");
                            if (questionTc) {
                              return (
                                <div key={si}>
                                  <QuestionCard
                                    args={questionTc.args || "{}"}
                                    callId={questionTc.call_id || ""}
                                    onAnswered={onAnswerQuestion}
                                  />
                                </div>
                              );
                            }
                            return (
                              <div key={si} className="message-tool-calls-list">
                                <ToolCallGroup
                                  toolCalls={sec.toolCalls}
                                  messageId={msg.id}
                                  onOpenTab={onOpenTab}
                                  onCancel={isGenerating && isLastMessage ? onCancelAgent : undefined}
                                  readFile={readFile}
                                  getFileUrl={getFileUrl}
                                />
                              </div>
                            );
                          }
                          if (sec.type === "text") {
                            return <div key={si}>{renderMarkdown(sec.content || "")}</div>;
                          }
                          return null;
                        })}
                      </>
                    ) : (
                      <>
                        {/* 旧格式降级：thinking → tools → text */}
                        {msg.reasoning_content !== undefined && (
                          <ThinkingBlock
                            content={msg.reasoning_content}
                            isGenerating={!!isGenerating}
                            isLastMessage={isLastMessage}
                          />
                        )}
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
                        {renderMarkdown(msg.content)}
                      </>
                    )}
                  </div>

                  <div className="message-footer">
                    {msg.role === "assistant" && msg.elapsed && (
                      <span className="message-elapsed" style={{ marginRight: "12px", opacity: 0.75, fontSize: "11px" }}>
                        运行时间: {msg.elapsed}s
                      </span>
                    )}
                    {(msg.role === "user" || !(isLastMessage && isGenerating)) && (
                      <span className="message-time" style={{ marginRight: "auto", fontSize: "11px" }}>
                        {new Date(msg.completedAt || msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    
                    {/* Copy, Like, Dislike buttons (only show if completed) */}
                    {(msg.role === "user" || !(isLastMessage && isGenerating)) && (
                      <>
                        <button 
                          className="message-action-icon"
                          onClick={handleCopy}
                          title="复制消息"
                        >
                          <Icons.Copy />
                        </button>
                        <button 
                          className={`message-action-icon${messageLiked ? " liked" : ""}`}
                          onClick={handleLike}
                          title="点赞"
                        >
                          <Icons.Like />
                        </button>
                        <button 
                          className={`message-action-icon${messageDisliked ? " disliked" : ""}`}
                          onClick={handleDislike}
                          title="点踩"
                        >
                          <Icons.Dislike />
                        </button>
                      </>
                    )}
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
