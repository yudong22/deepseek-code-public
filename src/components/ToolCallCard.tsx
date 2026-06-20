import React, { useState, useEffect, useRef } from "react";

/** 工具调用的类型定义 */
interface ToolCallData {
  name: string;
  args: string;
  result?: string;
  isError?: boolean;
  executing?: boolean;
}

interface ToolCallCardProps {
  toolCall: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
}

// ─── 工具 ID 分类 ─────────────────────────────────────────────────────────────
//
// opencode 真实工具 ID（全小写）：
//   文件操作类（在右侧预览区打开）：read / write / edit / apply_patch
//     以及旧版兼容名：fileread / filewrite / fileedit
//   工具区展开类（不进预览区）：bash / glob / grep / todoread / todowrite /
//     webfetch / websearch / plan / plan_exit / task / skill / question
//
// 策略：PREVIEW_TOOLS 集合内的走"文件链接"样式 + 点击打开预览区
//       其余全部走"展开/折叠"样式，没有"在新标签页打开"按钮

const PREVIEW_TOOLS = new Set([
  "read", "fileread",
  "write", "filewrite",
  "edit", "fileedit",
  "apply_patch",
]);

/** 规范化工具 ID 为真实 opencode 格式（小写）*/
function normalizeToolName(name: string): string {
  return (name || "").toLowerCase().trim();
}

/** 解析参数 JSON，提取最具代表性的预览字符串 */
function getArgsPreview(tc: ToolCallData): string {
  try {
    const parsed = JSON.parse(tc.args);
    if (parsed.path) return parsed.path;
    if (parsed.file_path) return parsed.file_path;
    if (parsed.command) return parsed.command;
    if (parsed.pattern) return parsed.pattern;
    if (parsed.glob) return parsed.glob;
    if (parsed.query) return parsed.query;
    if (parsed.url) return parsed.url;
    return JSON.stringify(parsed);
  } catch {
    return tc.args || "";
  }
}

/** 从结果 JSON 中提取可展示的内容与语言 */
function getToolResultDisplay(tc: ToolCallData): { language: string; content: string } {
  const name = normalizeToolName(tc.name);
  let language = "text";
  let content = tc.result || "";

  if (name === "read" || name === "fileread") {
    try {
      const parsed = JSON.parse(tc.result || "{}");
      if (parsed.content !== undefined) {
        content = parsed.content;
        const ext = getArgsPreview(tc).split(".").pop()?.split("?")[0] || "text";
        language = ext;
      }
    } catch {}

  } else if (name === "write" || name === "filewrite" || name === "edit" || name === "fileedit" || name === "apply_patch") {
    // write/edit 结果通常是 diff 或确认信息；尝试提取 new_content / content
    try {
      const parsed = JSON.parse(tc.result || "{}");
      if (parsed.content !== undefined) {
        content = parsed.content;
      } else if (parsed.new_content !== undefined) {
        content = parsed.new_content;
      } else if (typeof parsed === "string") {
        content = parsed;
      }
      const ext = getArgsPreview(tc).split(".").pop()?.split("?")[0] || "text";
      language = ext;
    } catch {
      content = tc.result || "";
    }

  } else if (name === "bash") {
    try {
      const parsed = JSON.parse(tc.result || "{}");
      content = parsed.output || parsed.stdout || parsed.stderr || tc.result || "";
      language = "bash";
    } catch {}

  } else if (name === "glob" || name === "grep") {
    language = "json";
    try {
      content = JSON.stringify(JSON.parse(tc.result || "{}"), null, 2);
    } catch {}

  } else if (name === "webfetch") {
    // webfetch 返回网页文本，可能是 markdown
    try {
      const parsed = JSON.parse(tc.result || "{}");
      content = parsed.content || parsed.text || tc.result || "";
    } catch {}
    language = "markdown";

  } else if (name === "websearch") {
    language = "json";
    try {
      content = JSON.stringify(JSON.parse(tc.result || "{}"), null, 2);
    } catch {}
  }

  return { language, content };
}

/** 从路径中取最后一段作为 tab 标题 */
function fileBaseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

// ─── 计时 hook ────────────────────────────────────────────────────────────────

function useElapsed(isDone: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isDone) {
      startRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isDone]);

  return elapsed;
}

// ─── 错误检测 ─────────────────────────────────────────────────────────────────

function detectError(tc: ToolCallData): boolean {
  if (tc.isError) return true;
  if (tc.result === undefined) return false;
  try {
    const parsed = JSON.parse(tc.result);
    return parsed && (parsed.error !== undefined || parsed.success === false);
  } catch {
    return false;
  }
}

// ─── 文件操作工具（read / write / edit / apply_patch）────────────────────────
// 只显示一行：状态点 + 工具名 + 可点击文件链接，点击在右侧预览区打开

function FileToolCard({ tc, messageId, index, onOpenTab }: {
  tc: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: ToolCallCardProps["onOpenTab"];
}) {
  const isDone = tc.result !== undefined;
  const isError = detectError(tc);
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone);
  const name = normalizeToolName(tc.name);
  const argsPreview = getArgsPreview(tc);
  const fileName = fileBaseName(argsPreview);

  let statusColor = "#007aff";
  if (isDone) statusColor = isError ? "#ff3b30" : "#34c759";

  // 执行中的动作描述
  const actionLabel: Record<string, string> = {
    read: "reading", fileread: "reading",
    write: "writing", filewrite: "writing",
    edit: "editing", fileedit: "editing",
    apply_patch: "patching",
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone || isError) return;
    const { language, content } = getToolResultDisplay(tc);
    if (!content) return;
    onOpenTab({
      id: `tool-${messageId}-${index}`,
      title: fileName,
      type: "tool_result",
      content,
      language,
    });
  };

  return (
    <div style={{
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: "12px",
      lineHeight: "1.8",
      margin: "2px 0",
      color: "inherit",
      display: "flex",
      alignItems: "center",
      gap: "5px",
      flexWrap: "wrap",
    }}>
      {/* 状态圆点 */}
      <span style={{ color: statusColor, fontSize: "14px", lineHeight: 1, userSelect: "none", flexShrink: 0, animation: isExecuting ? "tc-pulse 1.5s ease-in-out infinite" : "none" }}>•</span>

      {/* 工具名 */}
      <span style={{ fontWeight: "bold", flexShrink: 0, opacity: 0.8 }}>{name}</span>

      {/* 文件名链接 */}
      <span
        onClick={handleClick}
        title={argsPreview}
        style={{
          color: isDone && !isError ? "#007aff" : "inherit",
          cursor: isDone && !isError ? "pointer" : "default",
          textDecoration: isDone && !isError ? "underline" : "none",
          opacity: isDone ? 1 : 0.55,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "260px",
          flexShrink: 1,
        }}
      >
        {fileName}
      </span>

      {/* 耗时 */}
      <span style={{ fontSize: "11px", opacity: 0.35, flexShrink: 0 }}>{elapsed}s</span>

      {/* 状态附言 */}
      {isExecuting && (
        <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", flexShrink: 0, animation: "tc-pulse 1.5s ease-in-out infinite" }}>
          executing…
        </span>
      )}
      {!isDone && !isExecuting && (
        <span style={{ fontSize: "11px", opacity: 0.45, fontStyle: "italic", flexShrink: 0 }}>
          {actionLabel[name] ?? "running"}…
        </span>
      )}
      {isDone && isError && (
        <span style={{ fontSize: "11px", color: "#ff3b30", flexShrink: 0 }}>failed</span>
      )}
    </div>
  );
}

// ─── 工具区展开工具（bash / glob / grep / todo / webfetch / websearch / ...） ──
// 显示可展开/折叠的输出，不提供"在新标签页打开"按钮

function ExpandableToolCard({ tc }: {
  tc: ToolCallData;
}) {
  const isDone = tc.result !== undefined;
  const isError = detectError(tc);
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone);
  const name = normalizeToolName(tc.name);
  const argsPreview = getArgsPreview(tc);
  const { content } = getToolResultDisplay(tc);

  const [expanded, setExpanded] = useState(!isDone);

  useEffect(() => {
    if (isDone) setExpanded(false);
  }, [isDone]);

  let statusColor = "#007aff";
  if (isDone) statusColor = isError ? "#ff3b30" : "#34c759";

  const formatOutput = (text: string) => {
    if (!text) return "";
    const lines = text.split("\n");
    if (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
    return lines.map((l, i) => (i === 0 ? `  └ ${l}` : `    ${l}`)).join("\n");
  };

  return (
    <div style={{
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: "12px",
      lineHeight: "1.6",
      margin: "2px 0",
      color: "inherit",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* 头部：点击展开/收起 */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", width: "100%" }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", flex: 1 }}>
          {/* 状态圆点 */}
          <span style={{ color: statusColor, marginRight: "2px", fontSize: "14px", lineHeight: 1, userSelect: "none", animation: isExecuting ? "tc-pulse 1.5s ease-in-out infinite" : "none" }}>•</span>
          {/* 工具名 */}
          <span style={{ fontWeight: "bold", opacity: 0.8 }}>{name}</span>
          {/* 参数预览 */}
          <span style={{ opacity: 0.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>({argsPreview})</span>
          {/* 耗时 */}
          <span style={{ fontSize: "11px", opacity: 0.35, marginLeft: "4px" }}>{elapsed}s</span>
          {/* 执行中标记 */}
          {isExecuting && (
            <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", animation: "tc-pulse 1.5s ease-in-out infinite" }}>
              executing…
            </span>
          )}
        </div>
        {/* 展开三角 */}
        <span style={{ fontSize: "10px", opacity: 0.4, width: "12px", textAlign: "center", marginLeft: "10px", marginRight: "4px" }}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {/* 展开内容 */}
      {expanded && isDone && content && (
        <pre style={{
          margin: "2px 0 0 0",
          fontFamily: "inherit",
          fontSize: "inherit",
          lineHeight: "inherit",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          color: "inherit",
          opacity: 0.8,
          maxHeight: "320px",
          overflowY: "auto",
          background: "transparent",
          border: "none",
          paddingLeft: 0,
        }}>
          {formatOutput(content)}
        </pre>
      )}

      {/* 执行中 */}
      {expanded && !isDone && (
        <div style={{ margin: "2px 0 0 0", opacity: 0.5 }}>
          <span>  └ 正在执行中…</span>
        </div>
      )}
    </div>
  );
}

// ─── 主入口：按工具分类分派 ───────────────────────────────────────────────────

export default function ToolCallCard({ toolCall: tc, messageId, index, onOpenTab }: ToolCallCardProps) {
  const name = normalizeToolName(tc.name);

  if (PREVIEW_TOOLS.has(name)) {
    return <FileToolCard tc={tc} messageId={messageId} index={index} onOpenTab={onOpenTab} />;
  }

  return <ExpandableToolCard tc={tc} />;
}

/**
 * ToolCallGroup — 工具调用组的扁平化渲染容器
 */
interface ToolCallGroupProps {
  toolCalls: ToolCallData[];
  messageId: string;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
}

export function ToolCallGroup({ toolCalls, messageId, onOpenTab }: ToolCallGroupProps) {
  return (
    <div className="tc-group-terminal" style={{
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      margin: "8px 0",
    }}>
      {toolCalls.map((tc, idx) => (
        <ToolCallCard
          key={idx}
          toolCall={tc}
          messageId={messageId}
          index={idx}
          onOpenTab={onOpenTab}
        />
      ))}
    </div>
  );
}
