import React from "react";
import {
  ToolCallData,
  normalizeToolName,
  getArgsPreview,
  getToolResultDisplay,
  fileBaseName,
  useElapsed,
  detectError,
} from "./toolUtils";

interface FileToolCardProps {
  tc: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}

export default function FileToolCard({
  tc,
  messageId,
  index,
  onOpenTab,
  onCancel,
  readFile,
  getFileUrl,
}: FileToolCardProps) {
  const isDone = tc.result !== undefined;
  const isError = detectError(tc);
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone, !!tc.executing);
  const name = normalizeToolName(tc.name);
  const argsPreview = getArgsPreview(tc);
  const fileName = fileBaseName(argsPreview);

  let statusColor = "#007aff";
  if (isDone) statusColor = isError ? "#ff3b30" : "#34c759";

  const actionLabel: Record<string, string> = {
    read: "reading",
    fileread: "reading",
    write: "writing",
    filewrite: "writing",
    edit: "editing",
    fileedit: "editing",
    apply_patch: "patching",
  };

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone || isError) return;

    const ext = argsPreview.split(".").pop()?.toLowerCase() || "text";
    const imageExts = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);

    const isWriteOrEdit =
      name === "write" ||
      name === "filewrite" ||
      name === "edit" ||
      name === "fileedit" ||
      name === "apply_patch";

    if (isWriteOrEdit && argsPreview) {
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
        } catch {}
      }
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
        } catch {}
      }
    }

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
      <span style={{
        color: statusColor,
        fontSize: "14px",
        lineHeight: 1,
        userSelect: "none",
        flexShrink: 0,
        animation: isExecuting ? "tc-pulse 1.5s ease-in-out infinite" : "none"
      }}>•</span>

      <span style={{ fontWeight: "bold", flexShrink: 0, opacity: 0.8 }}>{name}</span>

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

      <span style={{ fontSize: "11px", opacity: 0.35, flexShrink: 0 }}>{elapsed}</span>

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
