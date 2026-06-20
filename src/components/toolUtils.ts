import { useState, useEffect, useRef } from "react";

export interface ToolCallData {
  name: string;
  args: string;
  call_id?: string;
  result?: string;
  isError?: boolean;
  executing?: boolean;
  step?: number;
}

export const PREVIEW_TOOLS = new Set([
  "read", "fileread",
  "write", "filewrite",
  "apply_patch",
]);

export const EDIT_TOOLS = new Set([
  "edit", "fileedit",
]);

/** 规范化工具 ID 为真实 opencode 格式（小写）*/
export function normalizeToolName(name: string): string {
  return (name || "").toLowerCase().trim();
}

/** 解析参数 JSON，提取最具代表性的预览字符串 */
export function getArgsPreview(tc: ToolCallData): string {
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
export function getToolResultDisplay(tc: ToolCallData): { language: string; content: string } {
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
export function fileBaseName(path: string): string {
  return path.split(/[/\\]/).filter(Boolean).pop() || path;
}

/** 计时 hook */
export function useElapsed(isDone: boolean, isActive: boolean): string {
  const shouldTimeRef = useRef(!isDone && isActive);
  const startRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [elapsedText, setElapsedText] = useState<string>(() =>
    shouldTimeRef.current ? "0.0" : ""
  );

  useEffect(() => {
    if (!shouldTimeRef.current) return;

    if (!isDone) {
      startRef.current = Date.now();
      setElapsedText("0.0");
      timerRef.current = setInterval(() => {
        const sec = (Date.now() - startRef.current) / 1000;
        setElapsedText((Math.round(sec * 2) / 2).toFixed(1));
      }, 500);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      const sec = (Date.now() - startRef.current) / 1000;
      setElapsedText((Math.round(sec * 2) / 2).toFixed(1));
    }

    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [isDone]);

  if (!shouldTimeRef.current) return "";
  return elapsedText ? elapsedText + "s" : "";
}

/** 错误检测 */
export function detectError(tc: ToolCallData): boolean {
  if (tc.isError) return true;
  if (tc.result === undefined) return false;
  try {
    const parsed = JSON.parse(tc.result);
    return parsed && (parsed.error !== undefined || parsed.success === false);
  } catch {
    return false;
  }
}
