import React, { useState, useEffect, useRef } from "react";

/** 工具调用的类型定义 */
interface ToolCallData {
  name: string;
  args: string;
  call_id?: string;
  result?: string;
  isError?: boolean;
  executing?: boolean;
  step?: number;
}

interface ToolCallCardProps {
  toolCall: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
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
  "apply_patch",
]);

const EDIT_TOOLS = new Set([
  "edit", "fileedit",
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
    try {
      const parsed = JSON.parse(tc.result || "{}");
      // 优先取 diff / content / output，其次 new_content
      if (parsed.diff !== undefined) {
        content = typeof parsed.diff === "string" ? parsed.diff : JSON.stringify(parsed.diff, null, 2);
      } else if (parsed.content !== undefined) {
        content = parsed.content;
      } else if (parsed.output !== undefined) {
        content = typeof parsed.output === "string" ? parsed.output : JSON.stringify(parsed.output, null, 2);
      } else if (parsed.new_content !== undefined) {
        content = parsed.new_content;
      } else if (typeof parsed === "string") {
        content = parsed;
      } else if (parsed.operation) {
        // opencode edit 结果元数据格式：{ operation, target, resource, existed, replacements }
        content = [
          `操作: ${parsed.operation}`,
          `文件: ${parsed.resource || parsed.target || "?"}`,
          `替换: ${parsed.replacements ?? "?"} 处`,
          parsed.existed ? "文件已存在" : "新建文件",
        ].join("\n");
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

function FileToolCard({ tc, messageId, index, onOpenTab, onCancel, readFile, getFileUrl }: {
  tc: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: ToolCallCardProps["onOpenTab"];
  onCancel?: ToolCallCardProps["onCancel"];
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
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

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone || isError) return;

    const ext = argsPreview.split(".").pop()?.toLowerCase() || "text";
    const imageExts = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);

    // write/edit/apply_patch：读取磁盘真实文件内容
    const isWriteOrEdit =
      name === "write" || name === "filewrite" ||
      name === "edit" || name === "fileedit" ||
      name === "apply_patch";

    if (isWriteOrEdit && argsPreview) {
      // 图片文件：使用 URL 方式预览
      if (imageExts.has(ext) && getFileUrl) {
        try {
          const url = await getFileUrl(argsPreview);
          if (url) {
            onOpenTab({
              id: `file-${argsPreview}-${messageId}`,
              title: fileName,
              type: "image",
              content: url,
              language: ext,
            });
            return;
          }
        } catch {
          // 回退
        }
      }
      // 文本文件：读取内容
      if (readFile) {
        try {
          const content = await readFile(argsPreview);
          onOpenTab({
            id: `file-${argsPreview}-${messageId}`,
            title: fileName,
            type: "tool_result",
            content,
            language: ext,
          });
          return;
        } catch {
          // 回退到工具结果内容
        }
      }
    }

    // read 工具或回退：使用工具结果内容
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

      {/* 状态附言 + 取消按钮 */}
      {!isDone && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          {isExecuting ? (
            <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", animation: "tc-pulse 1.5s ease-in-out infinite" }}>
              executing…
            </span>
          ) : (
            <span style={{ fontSize: "11px", opacity: 0.45, fontStyle: "italic" }}>
              {actionLabel[name] ?? "running"}…
            </span>
          )}
          {onCancel && (
            <span
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              title="Cancel"
              style={{
                cursor: "pointer", fontSize: "12px", opacity: 0.5, lineHeight: 1,
                padding: "1px 4px", borderRadius: "3px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              ✕
            </span>
          )}
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

function ExpandableToolCard({ tc, onCancel }: {
  tc: ToolCallData;
  onCancel?: ToolCallCardProps["onCancel"];
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
          {/* 执行中标记 + 取消 */}
          {isExecuting && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", animation: "tc-pulse 1.5s ease-in-out infinite" }}>
                executing…
              </span>
              {onCancel && (
                <span
                  onClick={(e) => { e.stopPropagation(); onCancel(); }}
                  title="Cancel"
                  style={{
                    cursor: "pointer", fontSize: "12px", opacity: 0.5, lineHeight: 1,
                    padding: "1px 4px", borderRadius: "3px",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  ✕
                </span>
              )}
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
        <div style={{ margin: "2px 0 0 0", opacity: 0.6 }}>
          <span>  └ 正在执行中…
            {onCancel && (
              <span
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                title="Cancel"
                style={{
                  cursor: "pointer", marginLeft: "8px", fontSize: "12px", opacity: 0.6,
                  padding: "1px 4px", borderRadius: "3px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                [Cancel]
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── todowrite 待办卡片 ───────────────────────────────────────────────────────

interface TodoItem {
  text: string;
  status: string; // "pending" | "in_progress" | "completed"
}

function parseTodoItems(tc: ToolCallData): TodoItem[] {
  try {
    const parsed = JSON.parse(tc.args);
    // opencode todowrite 格式：{ "todos": "[...]" } 或直接是数组
    const rawItems = parsed.todos || parsed.items || parsed;
    if (Array.isArray(rawItems)) {
      return rawItems.map((item: any) => ({
        text: typeof item === "string" ? item : (item.text || item.content || JSON.stringify(item)),
        status: item.status || "pending",
      }));
    }
    if (typeof rawItems === "string") {
      // todos 字段可能是 JSON 字符串
      const nested = JSON.parse(rawItems);
      if (Array.isArray(nested)) {
        return nested.map((item: any) => ({
          text: typeof item === "string" ? item : (item.text || item.content || JSON.stringify(item)),
          status: item.status || "pending",
        }));
      }
    }
  } catch {}
  return [];
}

function TodoListCard({ tc, onCancel }: {
  tc: ToolCallData;
  onCancel?: ToolCallCardProps["onCancel"];
}) {
  const isDone = tc.result !== undefined;
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone);
  const items = parseTodoItems(tc);

  const doneCount = items.filter((i) => i.status === "completed").length;
  const totalCount = items.length;

  const statusIcon: Record<string, string> = {
    pending: "○",
    in_progress: "◐",
    completed: "●",
  };
  const statusColor: Record<string, string> = {
    pending: "#8e8e93",
    in_progress: "#007aff",
    completed: "#34c759",
  };

  let headerColor = "#007aff";
  if (isDone) headerColor = totalCount > 0 && doneCount === totalCount ? "#34c759" : "#007aff";

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: "12px",
      margin: "4px 0",
      padding: "8px 12px",
      background: "rgba(0, 122, 255, 0.04)",
      borderRadius: "8px",
      borderLeft: "3px solid #007aff",
    }}>
      {/* 头部 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: items.length > 0 ? "6px" : "0",
        fontWeight: 600,
        color: headerColor,
      }}>
        <span>TODOs</span>
        {totalCount > 0 && (
          <span style={{ fontSize: "11px", opacity: 0.5, fontWeight: 400 }}>
            {doneCount}/{totalCount}
          </span>
        )}
        <span style={{ fontSize: "11px", opacity: 0.35, fontWeight: 400, marginLeft: "4px" }}>
          {elapsed}s
        </span>
        {isExecuting && (
          <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", fontWeight: 400 }}>
            writing…
          </span>
        )}
        {onCancel && isExecuting && (
          <span
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            title="Cancel"
            style={{
              cursor: "pointer", fontSize: "12px", opacity: 0.5, lineHeight: 1,
              marginLeft: "auto", padding: "1px 4px", borderRadius: "3px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ✕
          </span>
        )}
      </div>

      {/* 待办列表 */}
      {items.map((item, idx) => (
        <div key={idx} style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "6px",
          padding: "3px 0",
          color: item.status === "completed" ? "#8e8e93" : "inherit",
          textDecoration: item.status === "completed" ? "line-through" : "none",
        }}>
          <span style={{
            color: statusColor[item.status] || "#8e8e93",
            flexShrink: 0,
            marginTop: "1px",
            fontSize: "13px",
          }}>
            {statusIcon[item.status] || "○"}
          </span>
          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {item.text}
          </span>
        </div>
      ))}

      {/* 执行中、无待办项 */}
      {!isDone && items.length === 0 && (
        <div style={{ opacity: 0.5, fontSize: "11px" }}>
          <span>正在生成待办列表…</span>
        </div>
      )}
    </div>
  );
}

// ─── edit / fileedit 差异展示 ──────────────────────────────────────────────────

/** 解析 diff 内容，提取带 +/- 标记的行 */
function parseDiffLines(content: string): { type: "add" | "del" | "ctx"; text: string }[] {
  if (!content) return [];
  const lines = content.split("\n");
  // 去掉末尾空行
  if (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  
  const result: { type: "add" | "del" | "ctx"; text: string }[] = [];
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", text: line });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "del", text: line });
    } else {
      result.push({ type: "ctx", text: line });
    }
  }
  return result;
}

function EditDiffCard({ tc, messageId, index, onOpenTab, onCancel, readFile, getFileUrl }: {
  tc: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: ToolCallCardProps["onOpenTab"];
  onCancel?: ToolCallCardProps["onCancel"];
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}) {
  const isDone = tc.result !== undefined;
  const isError = detectError(tc);
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone);
  const name = normalizeToolName(tc.name);
  const argsPreview = getArgsPreview(tc);
  const fileName = fileBaseName(argsPreview);
  const { content } = getToolResultDisplay(tc);
  const diffLines = isDone ? parseDiffLines(content) : [];

  let statusColor = "#007aff";
  if (isDone) statusColor = isError ? "#ff3b30" : "#34c759";

  const actionLabel: Record<string, string> = {
    edit: "editing", fileedit: "editing",
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone || isError) return;
    
    const ext = argsPreview.split(".").pop()?.toLowerCase() || "text";
    const imageExts = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);

    if (imageExts.has(ext) && getFileUrl) {
      try {
        const url = await getFileUrl(argsPreview);
        if (url) {
          onOpenTab({ id: `file-${argsPreview}-${messageId}`, title: fileName, type: "image", content: url, language: ext });
          return;
        }
      } catch {}
    }
    
    if (readFile) {
      try {
        const fileContent = await readFile(argsPreview);
        onOpenTab({ id: `file-${argsPreview}-${messageId}`, title: fileName, type: "tool_result", content: fileContent, language: ext });
        return;
      } catch {}
    }

    const { language } = getToolResultDisplay(tc);
    if (content) {
      onOpenTab({ id: `tool-${messageId}-${index}`, title: fileName, type: "tool_result", content, language });
    }
  };

  const addCount = diffLines.filter(l => l.type === "add").length;
  const delCount = diffLines.filter(l => l.type === "del").length;

  return (
    <div style={{
      fontFamily: 'Menlo, Monaco, Consolas, "Courier New", monospace',
      fontSize: "12px",
      lineHeight: "1.6",
      margin: "4px 0",
      color: "inherit",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* 头部行 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "5px",
        flexWrap: "wrap",
        marginBottom: isDone && diffLines.length > 0 ? "4px" : "0",
      }}>
        <span style={{ color: statusColor, fontSize: "14px", lineHeight: 1, flexShrink: 0, animation: isExecuting ? "tc-pulse 1.5s ease-in-out infinite" : "none" }}>•</span>
        <span style={{ fontWeight: "bold", opacity: 0.8 }}>{name}</span>
        <span
          onClick={handleClick}
          title={argsPreview}
          style={{
            color: isDone && !isError ? "#007aff" : "inherit",
            cursor: isDone && !isError ? "pointer" : "default",
            textDecoration: isDone && !isError ? "underline" : "none",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "260px",
            flexShrink: 1,
          }}
        >
          {fileName}
        </span>
        <span style={{ fontSize: "11px", opacity: 0.35, flexShrink: 0 }}>{elapsed}s</span>
        {!isDone && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
            {isExecuting ? (
              <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", animation: "tc-pulse 1.5s ease-in-out infinite" }}>executing…</span>
            ) : (
              <span style={{ fontSize: "11px", opacity: 0.45, fontStyle: "italic" }}>{actionLabel[name] ?? "running"}…</span>
            )}
            {onCancel && (
              <span onClick={(e) => { e.stopPropagation(); onCancel(); }} title="Cancel"
                style={{ cursor: "pointer", fontSize: "12px", opacity: 0.5, lineHeight: 1, padding: "1px 4px", borderRadius: "3px" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>✕</span>
            )}
          </span>
        )}
        {isDone && isError && (
          <span style={{ fontSize: "11px", color: "#ff3b30", flexShrink: 0 }}>failed</span>
        )}
        {isDone && !isError && (addCount > 0 || delCount > 0) && (
          <span style={{ fontSize: "10px", opacity: 0.4, flexShrink: 0 }}>
            <span style={{ color: "#34c759" }}>+{addCount}</span>
            <span style={{ margin: "0 2px" }}>/</span>
            <span style={{ color: "#ff3b30" }}>-{delCount}</span>
          </span>
        )}
      </div>

      {/* diff 内容区：默认展开 */}
      {isDone && diffLines.length > 0 && (
        <div style={{
          borderLeft: "2px solid rgba(128,128,128,0.15)",
          marginLeft: "6px",
          paddingLeft: "8px",
          maxHeight: "320px",
          overflowY: "auto",
        }}>
          {diffLines.map((line, i) => (
            <div
              key={i}
              style={{
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                padding: "1px 6px",
                margin: "0 -6px",
                borderRadius: "2px",
                background: line.type === "add" ? "rgba(52, 199, 89, 0.12)"
                           : line.type === "del" ? "rgba(255, 59, 48, 0.10)"
                           : "transparent",
                color: line.type === "add" ? "#1a7f37"
                     : line.type === "del" ? "#cf222e"
                     : "inherit",
              }}
            >
              {line.text || " "}
            </div>
          ))}
        </div>
      )}

      {/* 无 diff 但有结果时：显示操作摘要 */}
      {isDone && !isError && diffLines.length === 0 && content && (
        <div style={{
          marginLeft: "6px",
          paddingLeft: "8px",
          borderLeft: "2px solid rgba(128,128,128,0.15)",
          fontSize: "11px",
          opacity: 0.7,
          whiteSpace: "pre-wrap",
        }}>
          {content}
        </div>
      )}

      {/* 执行中 */}
      {!isDone && (
        <div style={{ marginLeft: "6px", opacity: 0.5, fontSize: "11px" }}>
          <span>… 正在编辑中</span>
        </div>
      )}
    </div>
  );
}


// ─── 主入口：按工具分类分派 ───────────────────────────────────────────────────

export default function ToolCallCard({ toolCall: tc, messageId, index, onOpenTab, onCancel, readFile, getFileUrl }: ToolCallCardProps) {
  const name = normalizeToolName(tc.name);

  if (name === "todowrite") {
    return <TodoListCard tc={tc} onCancel={onCancel} />;
  }

  if (EDIT_TOOLS.has(name)) {
    return <EditDiffCard tc={tc} messageId={messageId} index={index} onOpenTab={onOpenTab} onCancel={onCancel} readFile={readFile} getFileUrl={getFileUrl} />;
  }

  if (PREVIEW_TOOLS.has(name)) {
    return <FileToolCard tc={tc} messageId={messageId} index={index} onOpenTab={onOpenTab} onCancel={onCancel} readFile={readFile} getFileUrl={getFileUrl} />;
  }

  return <ExpandableToolCard tc={tc} onCancel={onCancel} />;
}

/**
 * ToolCallGroup — 工具调用组的扁平化渲染容器
 */
interface ToolCallGroupProps {
  toolCalls: ToolCallData[];
  messageId: string;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}

export function ToolCallGroup({ toolCalls, messageId, onOpenTab, onCancel, readFile, getFileUrl }: ToolCallGroupProps) {
  return (
    <div className="tc-group-terminal" style={{
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      margin: "8px 0",
    }}>
      {toolCalls.map((tc, idx) => {
        const stableKey = tc.call_id || `tc-${idx}`;
        return (
          <ToolCallCard
            key={stableKey}
            toolCall={tc}
            messageId={messageId}
            index={idx}
            onOpenTab={onOpenTab}
            onCancel={onCancel}
            readFile={readFile}
            getFileUrl={getFileUrl}
          />
        );
      })}
    </div>
  );
}
