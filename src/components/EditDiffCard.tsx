import React, { useState, useEffect } from "react";
import {
  ToolCallData,
  normalizeToolName,
  getArgsPreview,
  getToolResultDisplay,
  fileBaseName,
  useElapsed,
  detectError,
} from "./toolUtils";

interface DiffLine {
  type: "add" | "del" | "ctx";
  text: string;
  lineNumber?: number;
}

interface EditDiffCardProps {
  tc: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}

function getEditArgs(tc: ToolCallData): { oldString: string; newString: string } | null {
  try {
    const args = JSON.parse(tc.args);
    if (args.oldString !== undefined && args.newString !== undefined) {
      return { oldString: args.oldString || "", newString: args.newString || "" };
    }
  } catch {}
  return null;
}

function buildDiffWithContext(fileContent: string, oldString: string, newString: string): DiffLine[] {
  const fileLines = fileContent.split("\n");
  const oldLines = oldString.split("\n").filter(l => l.trim());
  const newLines = newString.split("\n").filter(l => l.trim());
  if (oldLines.length === 0 && newLines.length === 0) return [];

  const oldStart = oldLines[0];
  let matchIdx = -1;
  for (let i = 0; i <= fileLines.length - oldLines.length; i++) {
    if (fileLines[i] === oldStart) {
      let allMatch = true;
      for (let j = 0; j < oldLines.length; j++) {
        if (fileLines[i + j] !== oldLines[j]) { allMatch = false; break; }
      }
      if (allMatch) { matchIdx = i; break; }
    }
  }

  const result: DiffLine[] = [];
  const CTX = 2;

  if (matchIdx === -1) {
    for (const l of oldLines) result.push({ type: "del", text: l });
    result.push({ type: "ctx", text: "", lineNumber: undefined });
    for (const l of newLines) result.push({ type: "add", text: l });
    return result;
  }

  const ctxStart = Math.max(0, matchIdx - CTX);
  for (let i = ctxStart; i < matchIdx; i++)
    result.push({ type: "ctx", text: fileLines[i], lineNumber: i + 1 });
  for (let i = 0; i < oldLines.length; i++)
    result.push({ type: "del", text: oldLines[i], lineNumber: matchIdx + i + 1 });
  result.push({ type: "ctx", text: "", lineNumber: undefined });
  for (let i = 0; i < newLines.length; i++)
    result.push({ type: "add", text: newLines[i], lineNumber: matchIdx + i + 1 });
  const ctxEnd = Math.min(fileLines.length, matchIdx + oldLines.length + CTX);
  for (let i = matchIdx + oldLines.length; i < ctxEnd; i++)
    result.push({ type: "ctx", text: fileLines[i], lineNumber: i + 1 });

  return result;
}

export default function EditDiffCard({
  tc,
  messageId,
  index,
  onOpenTab,
  onCancel,
  readFile,
  getFileUrl,
}: EditDiffCardProps) {
  const isDone = tc.result !== undefined;
  const isError = detectError(tc);
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone, !!tc.executing);
  const name = normalizeToolName(tc.name);
  const argsPreview = getArgsPreview(tc);
  const fileName = fileBaseName(argsPreview);
  const { content } = getToolResultDisplay(tc);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);

  useEffect(() => {
    if (!isDone || isError) return;
    const editArgs = getEditArgs(tc);
    if (!editArgs) { setDiffLines([]); return; }
    if (readFile && argsPreview) {
      readFile(argsPreview).then((fc) => {
        setDiffLines(buildDiffWithContext(fc, editArgs.oldString, editArgs.newString));
      }).catch(() => {
        const oldL = editArgs.oldString.split("\n").filter(Boolean);
        const newL = editArgs.newString.split("\n").filter(Boolean);
        const s: DiffLine[] = [];
        for (const l of oldL) s.push({ type: "del", text: l });
        s.push({ type: "ctx", text: "", lineNumber: undefined });
        for (const l of newL) s.push({ type: "add", text: l });
        setDiffLines(s);
      });
    }
  }, [isDone, isError, argsPreview, readFile, tc]);

  let statusColor = "#007aff";
  if (isDone) statusColor = isError ? "#ff3b30" : "#34c759";

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isDone || isError) return;
    const ext = argsPreview.split(".").pop()?.toLowerCase() || "text";
    const img = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
    if (img.has(ext) && getFileUrl) {
      try { const url = await getFileUrl(argsPreview); if (url) { onOpenTab({ id: `file-${argsPreview}-${messageId}`, title: fileName, type: "image", content: url, language: ext }); return; } } catch {}
    }
    if (readFile) {
      try { const fc = await readFile(argsPreview); onOpenTab({ id: `file-${argsPreview}-${messageId}`, title: fileName, type: "tool_result", content: fc, language: ext }); return; } catch {}
    }
    const { language } = getToolResultDisplay(tc);
    if (content) { onOpenTab({ id: `tool-${messageId}-${index}`, title: fileName, type: "tool_result", content, language }); }
  };

  const addCount = diffLines.filter(l => l.type === "add").length;
  const delCount = diffLines.filter(l => l.type === "del").length;

  return (
    <div className="edit-diff-wrap">
      <div className="edit-diff-header-row">
        <span style={{
          color: statusColor, fontSize: "14px", lineHeight: 1, flexShrink: 0,
          animation: isExecuting ? "tc-pulse 1.5s ease-in-out infinite" : "none",
        }}>•</span>

        <span className="edit-diff-title">
          {name}<span className="edit-diff-title-paren">(</span>
          <span
            onClick={handleClick}
            title={argsPreview}
            className={`edit-diff-filename${isDone && !isError ? " edit-diff-filename-link" : ""}`}
          >{fileName}</span>
          <span className="edit-diff-title-paren">)</span>
        </span>

        <span className="edit-diff-elapsed">{elapsed}</span>

        {!isDone && (
          <span className="edit-diff-status-row">
            {isExecuting
              ? <span className="edit-diff-executing" style={{ animation: "tc-pulse 1.5s ease-in-out infinite" }}>executing…</span>
              : <span className="edit-diff-editing">editing…</span>
            }
            {onCancel && (
              <span
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="edit-diff-cancel"
              >✕</span>
            )}
          </span>
        )}

        {isDone && isError && <span className="edit-diff-failed">failed</span>}

        {isDone && !isError && (addCount > 0 || delCount > 0) && (
          <span className="edit-diff-counts">
            {addCount > 0 && <span className="edit-diff-count-add">+{addCount}</span>}
            {addCount > 0 && delCount > 0 && <span className="edit-diff-count-sep">/</span>}
            {delCount > 0 && <span className="edit-diff-count-del">-{delCount}</span>}
          </span>
        )}
      </div>

      {isDone && diffLines.length > 0 && (
        <div className="edit-diff-block">
          {diffLines.map((line, i) => {
            const isSep = line.type === "ctx" && line.lineNumber === undefined;
            const isAdd = line.type === "add";
            const isDel = line.type === "del";
            const lineNum = line.lineNumber !== undefined ? line.lineNumber : "";

            let rowClass = "edit-diff-row";
            if (isSep) rowClass += " edit-diff-sep";
            else if (isAdd) rowClass += " edit-diff-add";
            else if (isDel) rowClass += " edit-diff-del";
            else rowClass += " edit-diff-ctx";

            return (
              <div key={i} className={rowClass}>
                {!isSep && (
                  <>
                    <span className="edit-diff-lnum">{lineNum}</span>
                    <span className={`edit-diff-pf${isAdd ? " edit-diff-pf-add" : isDel ? " edit-diff-pf-del" : ""}`}>
                      {isAdd ? "+" : isDel ? "−" : " "}
                    </span>
                    <pre className="edit-diff-code">{line.text}</pre>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
