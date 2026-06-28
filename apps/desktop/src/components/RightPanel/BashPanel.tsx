// React import not needed (jsx-runtime auto-import)
import type { PanelProps } from "./PanelShell";

/** Bash 终端样式 tab (v0.5.14 抽出) */
export function BashPanel({ activeTab }: PanelProps) {
  return (
    <div className="flex flex-col h-full p-4 box-border">
      <div className="flex flex-col bg-surface-primary rounded-lg border border-border-primary h-full overflow-hidden shadow-xl">
        <div className="flex items-center px-3.5 py-2.5 bg-surface-primary border-b border-border-primary select-none">
          <div className="flex gap-1.5 mr-4">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
          </div>
          <span className="text-[11px] color-[#a1a1aa] font-medium mx-auto -translate-x-6">
            {activeTab.title} (bash)
          </span>
        </div>
        <pre className="m-0 p-4 overflow-auto flex-1 font-mono text-[12px] leading-relaxed text-label-primary whitespace-pre-wrap break-all">
          <code>{activeTab.content}</code>
        </pre>
      </div>
    </div>
  );
}
