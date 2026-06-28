// React import not needed (jsx-runtime auto-import)
import { renderMarkdown } from "@/utils/markdown";
import type { PanelProps } from "./PanelShell";

/** Overview tab: 显示最近一条 assistant 消息的 markdown 渲染 */
export function OverviewPanel({ activeTab, messages, onPreviewFile }: PanelProps) {
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const latestAssistantMessage =
    assistantMessages.length > 0
      ? assistantMessages[assistantMessages.length - 1]
      : null;
  let content = latestAssistantMessage ? latestAssistantMessage.content : "";

  // Strip trailing stats block if present
  if (content) {
    content = content.replace(/\n\n---\n\*[\s\S]+\*$/, "");
  }

  return content ? (
    <div className="p-5 text-zinc-800 dark:text-label-primary leading-relaxed overflow-y-auto h-full box-border">
      {renderMarkdown(content, false, onPreviewFile, activeTab.sourcePath)}
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500 text-xs text-center h-full">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-50"
      >
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
      <span>No document generated yet.</span>
    </div>
  );
}
