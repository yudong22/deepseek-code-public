import { useEffect, useRef, useState } from "react";
import { Message } from "@/bridge";
import { renderMarkdown } from "@/utils/markdown";
import * as Icons from "@/components/Icons";
import { ToolCallGroup } from "@/components/ToolCallCard";
import QuestionCard from "@/components/QuestionCard";
import { fileBaseName } from "./toolUtils";

/** 根据文件扩展名返回图标 */
function getFileIcon(file: string): string {
  if (file.endsWith(".tsx") || file.endsWith(".ts")) return "📘";
  if (file.endsWith(".jsx") || file.endsWith(".js")) return "📒";
  if (file.endsWith(".rs")) return "🦀";
  if (file.endsWith(".md")) return "📝";
  if (file.endsWith(".json")) return "📋";
  if (file.endsWith(".css")) return "🎨";
  if (file.endsWith(".html")) return "🌐";
  if (file.endsWith(".toml") || file.endsWith(".yaml") || file.endsWith(".yml")) return "⚙️";
  if (file.endsWith(".py")) return "🐍";
  if (file.endsWith(".go")) return "🔷";
  if (file.endsWith(".sql")) return "🗃️";
  if (file.endsWith(".sh") || file.endsWith(".bash")) return "💻";
  if (file.endsWith(".svg") || file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) return "🖼️";
  return "📄";
}

/** 将用户消息中的 @file://path 渲染为可点击 chip（emoji + 文件名），其余文字保持纯文本 */
function renderUserContent(content: string, onPreviewFile?: (path: string) => void) {
  const regex = /@file:\/\/([\S]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(content)) !== null) {
    // @file 之前的文字
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const path = match[1];
    const name = fileBaseName(path);
    const icon = getFileIcon(path);
    parts.push(
      <span
        key={key++}
        onClick={(e) => { e.stopPropagation(); onPreviewFile?.(path); }}
        title={path}
        className="inline-flex items-center gap-1 mx-0.5 px-2 py-0.5 bg-deepseek-50 dark:bg-deepseek-900/30 border border-deepseek-200/60 dark:border-deepseek-800/80 rounded-md text-[11px] font-semibold text-deepseek-600 dark:text-deepseek-300 cursor-pointer hover:bg-deepseek-100 dark:hover:bg-deepseek-800/40 transition-colors align-middle"
      >
        <span className="text-xs leading-none">{icon}</span>
        <span className="max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">{name}</span>
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  // @file 之后剩余文字
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts;
}

interface ChatFeedProps {
  messages: Message[];
  planMode?: boolean;
  onOpenTab: (tab: { id: string; title: string; type: "overview" | "image" | "markdown" | "bash" | "tool_result"; content: string; language?: string }) => void;
  isGenerating?: boolean;
  onCancelAgent?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
  showToast?: (message: string) => void;
  /** 点击 markdown 中 file:// 链接时调用，仅更新右侧面板预览 */
  onPreviewFile?: (relativePath: string) => void;
  /** question 工具回答后的回调，参数为用户输入的答案 */
  onAnswerQuestion?: (answer: string) => void;
  /** 当前 Agent 步骤计数（仅在运行中大于 0） */
  activeStep?: number;
  /** 消息反馈持久化回调 */
  onFeedbackSave?: (allFeedback: Record<string, "like" | "dislike" | null>) => void;
  /** 已持久化的消息反馈 */
  initialFeedback?: Record<string, "like" | "dislike" | null>;
}

interface ThinkingBlockProps {
  content: string;
  isGenerating: boolean;
  isLastMessage: boolean;
  elapsed?: string;
}

function ThinkingBlock({ content, isGenerating, isLastMessage, elapsed }: ThinkingBlockProps) {
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
          <span className="text-[10px] text-zinc-400 ml-auto select-none shrink-0">
            {lines.length} lines{elapsed ? ` · ${elapsed}s` : ""} · click to expand
          </span>
        </div>
      )}
    </div>
  );
}

export default function ChatFeed({ messages, planMode, onOpenTab, isGenerating, onCancelAgent, readFile, getFileUrl, showToast, onAnswerQuestion, activeStep, onFeedbackSave, initialFeedback, onPreviewFile }: ChatFeedProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserAtBottomRef = useRef(true);
  const [stickyUserMsg, setStickyUserMsg] = useState<string | null>(null);
  const [likes, setLikes] = useState<Record<string, "like" | "dislike" | null>>(initialFeedback || {});

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
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-surface-primary">
      {/* 置顶 user 消息（悬浮定位，不占滚动容器空间，消除抖动） */}
      {stickyMsg && (
        <div className="absolute top-0 left-0 right-0 z-50 h-10 px-4 bg-white/80 dark:bg-surface-primary/80 backdrop-blur-md border-b border-border-primary flex items-center gap-2 shadow-sm text-xs font-semibold text-zinc-800 dark:text-zinc-200 select-none">
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

      {/* 步骤进度指示器 */}
      {isGenerating && activeStep && activeStep > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-brand-blue/5 border-b border-brand-blue/10 text-brand-blue dark:text-deepseek-400 text-xs font-medium select-none shrink-0">
          <span className="text-sm">🔄</span>
          <span>第 {activeStep} 步 — Agent 正在工作中…</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto min-h-0" ref={containerRef}>
        <div className="px-5 py-4 flex flex-col gap-4 max-w-[740px] mx-auto">
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          const messageLiked = likes[msg.id] === "like";
          const messageDisliked = likes[msg.id] === "dislike";

          const handleLike = () => {
            setLikes((prev) => {
              const nextVal = prev[msg.id] === "like" ? null : "like" as const;
              const updated: Record<string, "like" | "dislike" | null> = { ...prev, [msg.id]: nextVal };
              onFeedbackSave?.(updated);
              return updated;
            });
          };

          const handleDislike = () => {
            setLikes((prev) => {
              const nextVal = prev[msg.id] === "dislike" ? null : "dislike" as const;
              const updated: Record<string, "like" | "dislike" | null> = { ...prev, [msg.id]: nextVal };
              onFeedbackSave?.(updated);
              return updated;
            });
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
              className={`group flex flex-col gap-1 w-full max-w-full ${
                msg.role === "user" ? "self-end items-end" : "self-start items-start"
              }`}
              data-msg-id={msg.id}
              data-role={msg.role}
            >
              {msg.role === "user" ? (
                <div className="bg-surface-secondary dark:bg-surface-secondary text-label-primary dark:text-label-primary px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-[13px] max-w-full whitespace-pre-wrap leading-relaxed shadow-sm">
                  {renderUserContent(msg.content, onPreviewFile)}
                </div>
              ) : msg.role === "tool" ? (
                /* tool 角色消息（旧格式兼容，基本不使用） */
                <div className="flex items-center gap-2 p-2 my-1.5 text-xs text-[#8a8a8f] bg-black/2 dark:bg-white/2 rounded-md border-l-2 border-[#8e8e93] w-full">
                  <span className="text-sm">⚙️</span>
                  <span><strong>工具执行完成</strong></span>
                  <details className="ml-auto cursor-pointer">
                    <summary className="outline-none text-brand-blue text-[11px]">查看输出</summary>
                    <pre className="mt-1.5 bg-[#f8f8f8] dark:bg-surface-secondary p-2 rounded-md text-[11px] text-[#333] dark:text-label-primary max-h-[200px] overflow-auto whitespace-pre-wrap break-all">{msg.content}</pre>
                  </details>
                </div>
              ) : (
                <>
                  <div className="text-zinc-800 dark:text-label-primary text-[13px] leading-relaxed w-full whitespace-pre-wrap">
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
                                elapsed={tElapsed}
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
                            return <div key={si}>{renderMarkdown(sec.content || "", isLastMessage && isGenerating, onPreviewFile)}</div>;
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
                        {renderMarkdown(msg.content, isLastMessage && isGenerating, onPreviewFile)}
                      </>
                    )}
                  </div>

                  {/* 文件变更摘要卡片 */}
                  {msg.role === "assistant" && msg.filesChanged && msg.filesChanged.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 mb-1.5">
                        <Icons.FileCode />
                        <span>{msg.filesChanged.length} 个文件已更改</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {msg.filesChanged.map((f: { name: string; path: string }, i: number) => (
                          <button
                            key={i}
                            className="text-[11px] font-mono text-brand-blue dark:text-deepseek-400 bg-brand-blue/5 dark:bg-deepseek-400/10 hover:bg-brand-blue/10 dark:hover:bg-deepseek-400/20 px-2 py-0.5 rounded-sm border border-brand-blue/10 dark:border-deepseek-400/20 cursor-pointer transition-colors"
                            onClick={() => onOpenTab({ id: `file-${f.path}-${i}`, title: f.name, type: "tool_result", content: "" })}
                            title={`打开 ${f.path}`}
                          >
                            {f.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

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
                          className="bg-transparent border-0 cursor-pointer text-[#8e8e93] hover:text-label-secondary dark:hover:text-white p-1 rounded-md flex items-center justify-center transition-colors"
                          onClick={handleCopy}
                          title="复制消息"
                        >
                          <Icons.Copy />
                        </button>
                        <button 
                          className={`bg-transparent border-0 cursor-pointer text-[#8e8e93] p-1 rounded-md flex items-center justify-center transition-colors ${
                            messageLiked ? "text-blue-500 hover:text-blue-600" : "hover:text-label-secondary dark:hover:text-white"
                          }`}
                          onClick={handleLike}
                          title="点赞"
                        >
                          <Icons.Like />
                        </button>
                        <button 
                          className={`bg-transparent border-0 cursor-pointer text-[#8e8e93] p-1 rounded-md flex items-center justify-center transition-colors ${
                            messageDisliked ? "text-red-500 hover:text-red-600" : "hover:text-label-secondary dark:hover:text-white"
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
