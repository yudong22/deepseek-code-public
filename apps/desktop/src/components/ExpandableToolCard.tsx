import { useState, useEffect } from "react";
import {
  ToolCallData,
  normalizeToolName,
  getArgsPreview,
  getToolResultDisplay,
  useElapsed,
  detectError,
} from "./toolUtils";

interface ExpandableToolCardProps {
  tc: ToolCallData;
  onCancel?: () => void;
}

export default function ExpandableToolCard({ tc, onCancel }: ExpandableToolCardProps) {
  const isDone = tc.result !== undefined;
  const isError = detectError(tc);
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone, !!tc.executing);
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
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", width: "100%" }}
      >
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "4px", flex: 1 }}>
          <span style={{
            color: statusColor,
            marginRight: "2px",
            fontSize: "14px",
            lineHeight: 1,
            userSelect: "none",
            animation: isExecuting ? "tc-pulse 1.5s ease-in-out infinite" : "none"
          }}>•</span>
          <span style={{ fontWeight: "bold", opacity: 0.8 }}>{name}</span>
          <span style={{ opacity: 0.6, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>({argsPreview})</span>
          <span style={{ fontSize: "11px", opacity: 0.35, marginLeft: "4px" }}>{elapsed}</span>
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
        <span style={{ fontSize: "10px", opacity: 0.4, width: "12px", textAlign: "center", marginLeft: "10px", marginRight: "4px" }}>
          {expanded ? "▼" : "▶"}
        </span>
      </div>

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
