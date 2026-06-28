// React import not needed (jsx-runtime auto-import)
import { renderCodeBlock } from "@/utils/markdown";
import { PanelToolbar } from "./PanelToolbar";
import type { PanelProps } from "./PanelShell";

/** 普通源码文件 tab (v0.5.14 抽出) */
export function FilePanel({ activeTab }: PanelProps) {
  // P1-1: 从 title 提取扩展名作为 language fallback
  const titleExt = (activeTab.title || "").split(".").pop()?.toLowerCase() || "";
  const language = activeTab.language || titleExt || "text";

  return (
    <>
      <PanelToolbar
        title={activeTab.title}
        language={language}
        code={activeTab.content}
        copyTitle="复制代码"
        downloadTitle="下载文件"
        size="md"
      />
      <div className="sd-panel-code flex-1 overflow-auto">
        {renderCodeBlock(activeTab.content, language)}
      </div>
    </>
  );
}
