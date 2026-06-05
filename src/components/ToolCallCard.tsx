import React, { useState, useEffect, useRef } from "react";


/** 工具调用的类型定义 */
interface ToolCallData {
  name: string;
  args: string;
  result?: string;
  isError?: boolean;
}

interface ToolCallCardProps {
  toolCall: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
}

/** 根据工具名称返回对应的图标和颜色 */
function getToolMeta(name: string): { icon: string; color: string; label: string } {
  const map: Record<string, { icon: string; color: string; label: string }> = {
    FileRead:  { icon: "📄", color: "#5ac8fa", label: "Read" },
    FileWrite: { icon: "✏️", color: "#34c759", label: "Write" },
    FileEdit:  { icon: "🖊️", color: "#ff9f0a", label: "Edit" },
    Bash:      { icon: "⚡", color: "#bf5af2", label: "Run" },
    Glob:      { icon: "🔍", color: "#007aff", label: "Glob" },
    Grep:      { icon: "🔎", color: "#007aff", label: "Grep" },
    TodoRead:  { icon: "📋", color: "#ff9f0a", label: "Todo" },
    TodoWrite: { icon: "📝", color: "#ff9f0a", label: "Todo" },
  };
  return map[name] || { icon: "🔧", color: "#8e8e93", label: name };
}

/** 解析工具调用参数，提取可读的预览文本 */
function getArgsPreview(tc: ToolCallData): string {
  try {
    const parsed = JSON.parse(tc.args);
    if (parsed.path) return parsed.path;
    if (parsed.command) return parsed.command;
    if (parsed.pattern) return parsed.pattern;
    if (parsed.glob) return parsed.glob;
    return JSON.stringify(parsed);
  } catch {
    return tc.args;
  }
}

/** 根据工具类型提取展示语言和内容 */
function getToolResultDisplay(tc: ToolCallData): { language: string; contentToShow: string } {
  let language = "json";
  let contentToShow = tc.result || "";

  if (tc.name === "FileRead") {
    try {
      const parsedRes = JSON.parse(tc.result || "{}");
      if (parsedRes.content !== undefined) {
        contentToShow = parsedRes.content;
        const ext = getArgsPreview(tc).split(".").pop();
        language = ext || "text";
      }
    } catch {}
  } else if (tc.name === "Bash") {
    try {
      const parsedRes = JSON.parse(tc.result || "{}");
      contentToShow = parsedRes.stdout || parsedRes.stderr || tc.result || "";
      language = "bash";
    } catch {}
  } else if (tc.name === "Glob" || tc.name === "Grep") {
    language = "json";
    try {
      contentToShow = JSON.stringify(JSON.parse(tc.result || "{}"), null, 2);
    } catch {}
  }

  return { language, contentToShow };
}

/** 根据工具类型生成展示用的标题 */
function getTabTitle(tc: ToolCallData): string {
  const preview = getArgsPreview(tc);
  if (tc.name === "FileRead" || tc.name === "FileWrite" || tc.name === "FileEdit") {
    return preview.split(/[/\\]/).pop() || tc.name;
  }
  if (tc.name === "Bash") {
    return preview.length > 12 ? preview.substring(0, 12) + "..." : preview;
  }
  if (tc.name === "Glob" || tc.name === "Grep") {
    return `${tc.name}: ${preview.length > 8 ? preview.substring(0, 8) + "..." : preview}`;
  }
  return tc.name;
}

/** 格式化参数，美化展示 */
function formatArgs(args: string): string {
  try {
    return JSON.stringify(JSON.parse(args), null, 2);
  } catch {
    return args;
  }
}

export default function ToolCallCard({ toolCall: tc, messageId, index, onOpenTab }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDone = tc.result !== undefined;

  // 动态解析结果中的错误标记
  let isError = tc.isError;
  if (tc.result !== undefined && !isError) {
    try {
      const parsed = JSON.parse(tc.result);
      if (parsed && (parsed.error !== undefined || parsed.success === false)) {
        isError = true;
      }
    } catch {}
  }

  // 计时器：执行中递增，完成后停止
  useEffect(() => {
    if (!isDone) {
      startTimeRef.current = Date.now();
      intervalRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isDone]);

  const meta = getToolMeta(tc.name);
  const argsPreview = getArgsPreview(tc);
  // 只显示路径的最后一段作为文件名，路径过长时缩短
  const shortPreview = argsPreview.split(/[/\\]/).pop() || argsPreview;
  const displayPreview = shortPreview.length > 40 ? shortPreview.substring(0, 40) + "…" : shortPreview;

  const handleHeaderClick = () => {
    setExpanded((v) => !v);
  };

  const handleOpenTab = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDone) {
      const { language, contentToShow } = getToolResultDisplay(tc);
      const title = getTabTitle(tc);
      onOpenTab({
        id: `tool-${messageId}-${index}`,
        title,
        type: "tool_result",
        content: contentToShow,
        language,
      });
    }
  };

  const { contentToShow } = getToolResultDisplay(tc);

  return (
    <div className={`tool-call-card-v2 ${isDone ? (isError ? "tc-error" : "tc-done") : "tc-running"}`}>
      {/* ── Header row ── */}
      <div className="tc-header" onClick={handleHeaderClick}>
        {/* Left: status icon / spinner */}
        <div className="tc-status-icon">
          {!isDone ? (
            <span className="tc-spinner" />
          ) : isError ? (
            <span className="tc-icon-done tc-icon-error">✕</span>
          ) : (
            <span className="tc-icon-done tc-icon-ok">✓</span>
          )}
        </div>

        {/* Tool emoji */}
        <span className="tc-tool-emoji" title={tc.name}>{meta.icon}</span>

        {/* Tool name + preview */}
        <div className="tc-label">
          <span className="tc-name">{tc.name}</span>
          <span className="tc-preview">{displayPreview}</span>
        </div>

        {/* Right: elapsed / chevron */}
        <div className="tc-right">
          {!isDone ? (
            <span className="tc-elapsed tc-elapsed-live">{elapsed}s</span>
          ) : (
            <span className="tc-elapsed tc-elapsed-done">{elapsed}s</span>
          )}
          <span className={`tc-chevron ${expanded ? "tc-chevron-open" : ""}`}>›</span>
        </div>
      </div>

      {/* ── Expandable detail ── */}
      <div className={`tc-detail ${expanded ? "tc-detail-open" : ""}`}>
        <div className="tc-detail-inner">
          {/* Args */}
          <div className="tc-detail-section">
            <div className="tc-detail-label">参数</div>
            <pre className="tc-pre">{formatArgs(tc.args)}</pre>
          </div>

          {/* Result */}
          {isDone && (
            <div className="tc-detail-section">
              <div className="tc-detail-label-row">
                <span className="tc-detail-label">{isError ? "错误输出" : "执行结果"}</span>
                <button className="tc-open-btn" onClick={handleOpenTab}>在右侧面板查看 →</button>
              </div>
              <pre className={`tc-pre ${isError ? "tc-pre-error" : ""}`}>
                {contentToShow.length > 800
                  ? contentToShow.substring(0, 800) + "\n…（截断，点击右侧查看完整内容）"
                  : contentToShow}
              </pre>
            </div>
          )}

          {!isDone && (
            <div className="tc-detail-section">
              <div className="tc-detail-label">状态</div>
              <div className="tc-running-placeholder">
                <span className="tc-spinner-sm" />
                <span style={{ color: "#8e8e93", fontSize: "12px" }}>正在执行中...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ──────────────────────────────────────────────────────
 *  ToolCallGroup — collapsible group of tool call cards
 *  Shows summary when collapsed; individual cards when open
 * ────────────────────────────────────────────────────── */
interface ToolCallGroupProps {
  toolCalls: ToolCallData[];
  messageId: string;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
}

/** 根据一批工具调用生成人类可读的摘要 */
function buildGroupSummary(toolCalls: ToolCallData[]): string {
  const fileOps = toolCalls.filter((tc) =>
    ["FileRead", "FileWrite", "FileEdit"].includes(tc.name)
  ).length;
  const searchOps = toolCalls.filter((tc) =>
    ["Glob", "Grep"].includes(tc.name)
  ).length;
  const bashOps = toolCalls.filter((tc) => tc.name === "Bash").length;
  const otherOps = toolCalls.length - fileOps - searchOps - bashOps;

  const parts: string[] = [];
  if (fileOps > 0) parts.push(`${fileOps} 个文件`);
  if (searchOps > 0) parts.push(`搜索 ${searchOps} 次`);
  if (bashOps > 0) parts.push(`运行 ${bashOps} 条命令`);
  if (otherOps > 0) parts.push(`${otherOps} 个操作`);

  if (parts.length === 0) return `${toolCalls.length} 个工具`;

  const hasFileRead = toolCalls.some((tc) => tc.name === "FileRead");
  const hasFileWrite = toolCalls.some((tc) =>
    ["FileWrite", "FileEdit"].includes(tc.name)
  );
  const onlySearch = fileOps === 0 && searchOps > 0 && bashOps === 0;
  const onlyBash = fileOps === 0 && searchOps === 0 && bashOps > 0;

  if (onlySearch) return `搜索了 ${searchOps} 次`;
  if (onlyBash) return `运行了 ${bashOps} 条命令`;
  if (hasFileRead && !hasFileWrite && searchOps === 0 && bashOps === 0)
    return `探索了 ${fileOps} 个文件`;
  if (hasFileWrite && fileOps > 0 && searchOps === 0 && bashOps === 0)
    return `修改了 ${fileOps} 个文件`;

  return `操作了 ${parts.join("、")}`;
}

export function ToolCallGroup({ toolCalls, messageId, onOpenTab }: ToolCallGroupProps) {
  const [expanded, setExpanded] = useState(false);

  const isAnyRunning = toolCalls.some((tc) => tc.result === undefined);
  const hasError = toolCalls.some((tc) => {
    if (tc.isError) return true;
    if (tc.result !== undefined) {
      try {
        const p = JSON.parse(tc.result);
        return p && (p.error !== undefined || p.success === false);
      } catch {}
    }
    return false;
  });

  const summary = buildGroupSummary(toolCalls);
  const count = toolCalls.length;
  const statusColor = isAnyRunning ? "#007aff" : hasError ? "#ff3b30" : "#8e8e93";

  return (
    <div className="tc-group">
      {/* ── Group header row ── */}
      <div
        className="tc-group-header"
        onClick={() => setExpanded((v) => !v)}
        style={{ borderLeftColor: statusColor }}
      >
        {/* Left status */}
        <div className="tc-status-icon" style={{ flexShrink: 0 }}>
          {isAnyRunning ? (
            <span className="tc-spinner" />
          ) : hasError ? (
            <span className="tc-icon-done tc-icon-error">✕</span>
          ) : (
            <span className="tc-icon-done tc-icon-ok">✓</span>
          )}
        </div>

        {/* Summary text */}
        <span className="tc-group-summary">{summary}</span>

        {/* Count badge */}
        {count > 1 && <span className="tc-group-count">{count}</span>}

        {/* Chevron */}
        <span className={`tc-chevron ${expanded ? "tc-chevron-open" : ""}`}>›</span>
      </div>

      {/* ── Expanded body: individual cards ── */}
      <div className={`tc-group-body ${expanded ? "tc-group-body-open" : ""}`}>
        <div className="tc-group-inner">
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
      </div>
    </div>
  );
}
