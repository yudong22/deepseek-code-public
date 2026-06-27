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

  const statusColorClass = isDone 
    ? (isError ? "text-red-500" : "text-green-500") 
    : "text-brand-blue";

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
    <div className="font-mono text-xs leading-loose my-0.5 color-inherit flex items-center gap-1.5 flex-wrap">
      <span className={`text-sm font-bold leading-none select-none shrink-0 ${statusColorClass} ${isExecuting ? "animate-pulse" : ""}`}>
        •
      </span>

      <span className="font-bold shrink-0 opacity-80">{name}</span>

      <span
        onClick={handleClick}
        title={argsPreview}
        className={`truncate max-w-[260px] shrink ${
          isDone && !isError 
            ? "text-brand-blue dark:text-deepseek-400 cursor-pointer underline opacity-100" 
            : "opacity-55 cursor-default no-underline"
        }`}
      >
        {fileName}
      </span>

      <span className="text-[11px] opacity-35 shrink-0">{elapsed}</span>

      {!isDone && (
        <span className="inline-flex items-center gap-1.5 shrink-0">
          {isExecuting ? (
            <span className="text-[11px] opacity-60 italic animate-pulse">
              executing…
            </span>
          ) : (
            <span className="text-[11px] opacity-45 italic">
              {actionLabel[name] ?? "running"}…
            </span>
          )}
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
      {isDone && isError && (
        <span className="text-[11px] text-red-500 shrink-0 font-bold">failed</span>
      )}
    </div>
  );
}
