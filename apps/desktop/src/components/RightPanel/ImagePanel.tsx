// React import not needed (jsx-runtime auto-import)
import { PanelToolbar } from "./PanelToolbar";
import type { PanelProps } from "./PanelShell";

/** 图片预览 tab (v0.5.14 抽出) */
export function ImagePanel({ activeTab, isNightMode }: PanelProps) {
  return (
    <>
      <PanelToolbar
        icon={<span className="text-sm">🖼️</span>}
        title={activeTab.title}
        language={activeTab.language || "image"}
        code={activeTab.content}
        copyTitle="复制图片链接"
        downloadTitle="下载文件"
      />
      <div
        className={`flex-1 overflow-auto flex items-center justify-center p-4 ${isNightMode ? "bg-[#1c1c1e]" : "bg-[#f5f5f7]"}`}
      >
        <img
          src={activeTab.content}
          alt={activeTab.title}
          className="max-w-full max-h-full object-contain"
        />
      </div>
    </>
  );
}
