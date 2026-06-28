import { useState } from "react";
import { renderMarkdown, renderCodeBlock } from "@/utils/markdown";
import { PanelToolbar } from "./PanelToolbar";
import type { PanelProps } from "./PanelShell";

/** Markdown 文件 tab：外层是文件名 toolbar，内层是 Preview/Source 切换 (v0.5.14 抽出) */
export function MarkdownPanel({ activeTab, onPreviewFile }: PanelProps) {
  const [activeInnerTab, setActiveInnerTab] = useState<"preview" | "source">("preview");

  return (
    <>
      <PanelToolbar
        title={activeTab.title}
        language="md"
        code={activeTab.content}
        copyTitle="复制内容"
        downloadTitle="下载文件"
      />

      {/* 内部 Tab 栏：Preview / Source */}
      <div className="flex items-center gap-1 px-4 h-8 bg-surface-primary border-b border-border-primary shrink-0">
        <button
          className={`px-3 h-6 rounded-md text-xs font-semibold cursor-pointer border-0 bg-transparent transition-colors ${
            activeInnerTab === "preview"
              ? "bg-white dark:bg-surface-secondary text-[#111] dark:text-white shadow-sm"
              : "text-zinc-500 hover:bg-surface-secondary dark:hover:bg-surface-secondary"
          }`}
          onClick={() => setActiveInnerTab("preview")}
        >
          Preview
        </button>
        <button
          className={`px-3 h-6 rounded-md text-xs font-semibold cursor-pointer border-0 bg-transparent transition-colors ${
            activeInnerTab === "source"
              ? "bg-white dark:bg-surface-secondary text-[#111] dark:text-white shadow-sm"
              : "text-zinc-500 hover:bg-surface-secondary dark:hover:bg-surface-secondary"
          }`}
          onClick={() => setActiveInnerTab("source")}
        >
          Source
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        {activeInnerTab === "source" ? (
          <div className="sd-panel-code flex-1 overflow-auto">
            {renderCodeBlock(activeTab.content, "markdown")}
          </div>
        ) : (
          <div className="p-5 text-zinc-800 dark:text-label-primary leading-relaxed overflow-y-auto flex-1">
            {renderMarkdown(activeTab.content, false, onPreviewFile, activeTab.sourcePath)}
          </div>
        )}
      </div>
    </>
  );
}
