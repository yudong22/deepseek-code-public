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
  /** question 工具回答后的回调，参数为用户输入的答案 */
  onAnswerQuestion?: (answer: string) => void;
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
      className="py-1 my-2 text-[12px] font-mono text-[#8a8a8f] cursor-pointer select-none leading-relaxed overflow-hidden w-full"
      onClick={() => setExpanded((v) => !v)}
    >
      {expanded ? (
        /* 展开：每行显示 ∴ 前缀 */
        <div className="flex flex-col gap-0.5">
          {lines.map((line, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-[10px] text-zinc-400 select-none">∴</span>
              <span className="text-zinc-500 dark:text-zinc-500 flex-1 whitespace-pre-wrap break-all">{line}</span>
            </div>
          ))}
          {/* 流式输入中的闪烁光标 */}
          {isStreaming && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-zinc-400 select-none">∴</span>
              <span className="w-1.5 h-3.5 bg-[#8e8e93] animate-[blink-caret_1s_step-end_infinite] self-center" />
            </div>
          )}
        </div>
      ) : (
        /* 折叠：单行摘要 */
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-400 select-none">∴</span>
          <span className="truncate max-w-[400px] text-zinc-400 dark:text-zinc-600">
            {lines[0]
              ? lines[0].length > 60
                ? lines[0].slice(0, 60) + "…"
                : lines[0]
              : "Thinking…"}
          </span>
          <span className="text-[10px] text-zinc-400 ml-auto select-none">
            {lines.length} lines · click to expand
          </span>
        </div>
      )}
    </div>
  );
}

export default function ChatFeed({ messages, planMode, onOpenTab, isGenerating, onCancelAgent, readFile, getFileUrl, showToast, onAnswerQuestion }: ChatFeedProps) {
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
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-[#1c1c1e]">
      {/* 置顶 user 消息（悬浮定位，不占滚动容器空间，消除抖动） */}
      {stickyMsg && (
        <div className="absolute top-0 left-0 right-0 z-50 h-10 px-4 bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md border-b border-[#e3e3e3] dark:border-[#2c2c2e] flex items-center gap-2 shadow-sm text-xs font-semibold text-zinc-800 dark:text-zinc-200 select-none">
          <span className="text-sm">💬</span>
          <span className="truncate flex-1">{stickyMsg.content}</span>
        </div>
      )}

      {/* 规划模式横幅 */}
      {planMode && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-yellow-600 dark:text-yellow-400 text-xs font-medium select-none shrink-0">
          <span className="text-sm">📋</span>
          <span>规划模式 — Agent 仅执行读取和分析，不会修改文件</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0" ref={containerRef}>
        <div className="p-4 flex flex-col gap-4 max-w-[740px] mx-auto">
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
              className={`group flex flex-col gap-1 w-full max-w-[85%] ${
                msg.role === "user" ? "self-end items-end" : "self-start items-start"
              }`}
              data-msg-id={msg.id}
              data-role={msg.role}
            >
              {msg.role === "user" ? (
                <div className="bg-[#f2f2f7] dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-[13px] max-w-full whitespace-pre-wrap leading-relaxed shadow-sm">
                  {msg.content}
                </div>
              ) : msg.role === "tool" ? (
                /* tool 角色消息（旧格式兼容，基本不使用） */
                <div className="flex items-center gap-2 p-2 my-1.5 text-xs text-[#8a8a8f] bg-black/2 dark:bg-white/2 rounded-md border-l-2 border-[#8e8e93] w-full">
                  <span className="text-sm">⚙️</span>
                  <span><strong>工具执行完成</strong></span>
                  <details className="ml-auto cursor-pointer">
                    <summary className="outline-none text-brand-blue text-[11px]">查看输出</summary>
                    <pre className="mt-1.5 bg-[#f8f8f8] dark:bg-[#2c2c2e] p-2 rounded-md text-[11px] text-[#333] dark:text-[#f5f5f7] max-h-[200px] overflow-auto whitespace-pre-wrap break-all">{msg.content}</pre>
                  </details>
                </div>
              ) : (
                <>
                  <div className="text-zinc-800 dark:text-[#f5f5f7] text-[13px] leading-relaxed w-full whitespace-pre-wrap pr-4">
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
                                    result={questionTc.result}
                                    onAnswered={onAnswerQuestion}
                                  />
                                </div>
                              );
                            }
                            return (
                              <div key={si} className="my-1 w-full">
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
                            return <div key={si}>{renderMarkdown(sec.content || "", isLastMessage && isGenerating)}</div>;
                          }
                          return null;
                        })}
                      </>
                    ) : (
                      <>
                        {/* 旧格式降级：thinking → tools → text */}
                        {/* 等待 AI 首次响应时的 loading，融入思考样式 */}
                        {isGenerating && isLastMessage &&
                          (!msg.reasoning_content) &&
                          (!msg.toolCalls || msg.toolCalls.length === 0) &&
                          !msg.content && (
                          <div className="py-1 my-2 text-[12px] font-mono text-[#8a8a8f] w-full flex flex-col gap-0.5">
                            <div className="flex items-start gap-2">
                              <span className="text-[10px] text-zinc-400 select-none">∴</span>
                              <span className="text-zinc-500 dark:text-zinc-500 font-semibold">正在分析你的需求</span>
                              <span className="w-1.5 h-3.5 bg-[#8e8e93] animate-[blink-caret_1s_step-end_infinite] self-center" />
                            </div>
                            <div className="flex items-start gap-2 text-[10px] text-zinc-500">
                              <span className="text-[10px] text-zinc-400 select-none"> </span>
                              <span className="text-zinc-400 font-normal">模型响应需要一些时间，请稍候…</span>
                            </div>
                          </div>
                        )}
                        {msg.reasoning_content !== undefined && (
                          <ThinkingBlock
                            content={msg.reasoning_content}
                            isGenerating={!!isGenerating}
                            isLastMessage={isLastMessage}
                          />
                        )}
                        {msg.toolCalls && msg.toolCalls.length > 0 && (
                          <div className="my-1 w-full">
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
                        {renderMarkdown(msg.content, isLastMessage && isGenerating)}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-[#8e8e93] h-5 w-full opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                    {msg.role === "assistant" && msg.elapsed && (
                      <span className="mr-3 text-zinc-500">
                        运行时间: {msg.elapsed}s
                      </span>
                    )}
                    {!(isLastMessage && isGenerating) && (
                      <span className="mr-auto text-zinc-400">
                        {new Date(msg.completedAt || msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                    
                    {/* Copy, Like, Dislike buttons (only show if completed) */}
                    {!(isLastMessage && isGenerating) && (
                      <>
                        <button 
                          className="bg-transparent border-0 cursor-pointer text-[#8e8e93] hover:text-[#555] dark:hover:text-white p-1 rounded-md flex items-center justify-center transition-colors"
                          onClick={handleCopy}
                          title="复制消息"
                        >
                          <Icons.Copy />
                        </button>
                        <button 
                          className={`bg-transparent border-0 cursor-pointer text-[#8e8e93] p-1 rounded-md flex items-center justify-center transition-colors ${
                            messageLiked ? "text-blue-500 hover:text-blue-600" : "hover:text-[#555] dark:hover:text-white"
                          }`}
                          onClick={handleLike}
                          title="点赞"
                        >
                          <Icons.Like />
                        </button>
                        <button 
                          className={`bg-transparent border-0 cursor-pointer text-[#8e8e93] p-1 rounded-md flex items-center justify-center transition-colors ${
                            messageDisliked ? "text-red-500 hover:text-red-600" : "hover:text-[#555] dark:hover:text-white"
                          }`}
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
    </div>
  );
}
