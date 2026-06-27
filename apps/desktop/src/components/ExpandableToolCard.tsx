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

  const statusColorClass = isDone 
    ? (isError ? "text-red-500" : "text-green-500") 
    : "text-brand-blue";

  const formatOutput = (text: string) => {
    if (!text) return "";
    const lines = text.split("\n");
    if (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
    return lines.map((l, i) => (i === 0 ? `  └ ${l}` : `    ${l}`)).join("\n");
  };

  return (
    <div className="font-mono text-xs leading-relaxed my-0.5 color-inherit flex flex-col">
      <div
        onClick={() => setExpanded(v => !v)}
        className="flex items-center cursor-pointer select-none w-full"
      >
        <div className="flex items-center flex-wrap gap-1 flex-1">
          <span className={`text-sm font-bold leading-none select-none mr-0.5 ${statusColorClass} ${isExecuting ? "animate-pulse" : ""}`}>
            •
          </span>
          <span className="font-bold opacity-80">{name}</span>
          <span className="opacity-60 whitespace-pre-wrap break-all">({argsPreview})</span>
          <span className="text-[11px] opacity-35 ml-1">{elapsed}</span>
          {isExecuting && (
            <span className="inline-flex items-center gap-1">
              <span className="text-[11px] opacity-60 italic animate-pulse">
                executing…
              </span>
              {onCancel && (
                <span
                  onClick={(e) => { e.stopPropagation(); onCancel(); }}
                  title="Cancel"
                  className="cursor-pointer text-xs opacity-50 px-1 py-0.5 rounded-sm hover:bg-black/10 transition-colors"
                >
                  ✕
                </span>
              )}
            </span>
          )}
        </div>
        <span className="text-[10px] opacity-40 w-3 text-center ml-2.5 mr-1">
          {expanded ? "▼" : "▶"}
        </span>
      </div>

      {expanded && isDone && content && (
        <pre className="m-0 mt-0.5 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all color-inherit opacity-80 max-h-80 overflow-y-auto bg-transparent border-none p-0">
          {formatOutput(content)}
        </pre>
      )}

      {expanded && !isDone && (
        <div className="mt-0.5 opacity-60">
          <span>  └ 正在执行中…
            {onCancel && (
              <span
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                title="Cancel"
                className="cursor-pointer ml-2 text-xs opacity-60 px-1 py-0.5 rounded-sm hover:bg-black/10 transition-colors"
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
