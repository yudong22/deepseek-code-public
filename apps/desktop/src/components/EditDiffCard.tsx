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

  const statusColorClass = isDone 
    ? (isError ? "text-red-500" : "text-green-500") 
    : "text-brand-blue";

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
    <div className="font-mono text-xs leading-relaxed my-0.5 color-inherit flex flex-col">
      <div className="flex items-center flex-wrap select-none w-full gap-1">
        <span className={`text-sm font-bold leading-none select-none mr-0.5 ${statusColorClass} ${isExecuting ? "animate-pulse" : ""}`}>
          •
        </span>

        <span className="font-semibold flex items-center">
          {name}<span className="opacity-50 mx-0.5">(</span>
          <span
            onClick={handleClick}
            title={argsPreview}
            className={`opacity-80 ${isDone && !isError ? "cursor-pointer hover:underline text-brand-blue dark:text-deepseek-400" : ""}`}
          >{fileName}</span>
          <span className="opacity-50 mx-0.5">)</span>
        </span>

        <span className="text-[11px] opacity-35 ml-1">{elapsed}</span>

        {!isDone && (
          <span className="inline-flex items-center gap-1">
            {isExecuting
              ? <span className="text-[11px] opacity-60 italic animate-pulse">executing…</span>
              : <span className="text-[11px] opacity-50 italic">editing…</span>
            }
            {onCancel && (
              <span
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="cursor-pointer text-xs opacity-50 px-1 py-0.5 rounded-sm hover:bg-black/10 transition-colors"
              >✕</span>
            )}
          </span>
        )}

        {isDone && isError && <span className="text-red-500 font-bold ml-1.5">failed</span>}

        {isDone && !isError && (addCount > 0 || delCount > 0) && (
          <span className="inline-flex items-center gap-0.5 text-[10px] ml-1.5">
            {addCount > 0 && <span className="text-green-500 font-bold">+{addCount}</span>}
            {addCount > 0 && delCount > 0 && <span className="opacity-30">/</span>}
            {delCount > 0 && <span className="text-red-500 font-bold">-{delCount}</span>}
          </span>
        )}
      </div>

      {isDone && diffLines.length > 0 && (
        <div className="mt-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-[#f9f9fb] dark:bg-[#18181b] overflow-hidden flex flex-col font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto">
          {diffLines.map((line, i) => {
            const isSep = line.type === "ctx" && line.lineNumber === undefined;
            const isAdd = line.type === "add";
            const isDel = line.type === "del";
            const lineNum = line.lineNumber !== undefined ? line.lineNumber : "";

            let rowClass = "flex items-stretch";
            if (isSep) rowClass += " h-[1px] bg-zinc-200 dark:bg-zinc-800 my-0.5";
            else if (isAdd) rowClass += " bg-green-500/10 dark:bg-green-500/5 text-green-700 dark:text-green-400";
            else if (isDel) rowClass += " bg-red-500/10 dark:bg-red-500/5 text-red-700 dark:text-red-400";
            else rowClass += " text-zinc-700 dark:text-zinc-300";

            return (
              <div key={i} className={rowClass}>
                {!isSep && (
                  <>
                    <span className="py-0.5 px-2 text-right text-zinc-400 dark:text-zinc-600 bg-zinc-50 dark:bg-[#161618] border-r border-[#e3e3e3] dark:border-[#202022] min-w-[32px] select-none">{lineNum}</span>
                    <span className={`py-0.5 px-1.5 select-none font-bold shrink-0 align-middle ${isAdd ? "text-green-500" : isDel ? "text-red-500" : ""}`}>
                      {isAdd ? "+" : isDel ? "−" : " "}
                    </span>
                    <pre className="py-0.5 px-2 overflow-x-auto m-0 flex-1 whitespace-pre">{line.text}</pre>
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
