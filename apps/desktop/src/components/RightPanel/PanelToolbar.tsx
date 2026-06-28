import React from "react";
import { CodeBlockCopyButton, CodeBlockDownloadButton } from "@/utils/markdown";

/** Panel 顶部工具栏：标题 + 语言标签 + 复制/下载按钮（统一组件，v0.5.14 抽出） */
export interface PanelToolbarProps {
  icon?: React.ReactNode;
  title: string;
  language?: string;
  /** 复制内容 */
  code: string;
  /** 复制/下载按钮的 aria-label（默认"复制"+"下载"） */
  copyTitle?: string;
  downloadTitle?: string;
  /** 工具栏高度：默认 h-8（与右侧 tab header 高度一致） */
  size?: "sm" | "md";
}

const TOOLBAR_BTN_CLASS = "p-1.5 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors";

export function PanelToolbar({ icon, title, language, code, copyTitle = "复制", downloadTitle = "下载", size = "sm" }: PanelToolbarProps) {
  const heightCls = size === "md" ? "h-9" : "h-8";
  const titleMaxW = size === "md" ? "max-w-[180px]" : "max-w-[200px]";
  return (
    <div className={`flex items-center gap-1.5 px-4 ${heightCls} bg-surface-primary border-b border-border-primary shrink-0 text-xs text-zinc-500 select-none`}>
      {icon ?? <span className="text-sm">📄</span>}
      <span className={`font-semibold text-zinc-800 dark:text-label-primary truncate ${titleMaxW}`}>{title}</span>
      {language && (
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase font-mono bg-surface-secondary px-1 rounded-sm border border-zinc-200/50 dark:border-zinc-800">
          {language}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <CodeBlockDownloadButton code={code} language={language} className={TOOLBAR_BTN_CLASS} title={downloadTitle} />
        <CodeBlockCopyButton code={code} className={TOOLBAR_BTN_CLASS} title={copyTitle} />
      </div>
    </div>
  );
}
