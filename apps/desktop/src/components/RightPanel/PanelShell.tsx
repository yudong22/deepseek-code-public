import React from "react";
import { Message } from "@/bridge";
import { OverviewPanel } from "./OverviewPanel";
import { ImagePanel } from "./ImagePanel";
import { BashPanel } from "./BashPanel";
import { MarkdownPanel } from "./MarkdownPanel";
import { FilePanel } from "./FilePanel";

export type TabType = "overview" | "image" | "markdown" | "bash" | "tool_result";

export interface Tab {
  id: string;
  title: string;
  type: TabType;
  content: string;
  language?: string;
  sourcePath?: string;
}

/** 外壳属性（aside 外层 + resize handle），由 RightPanel 统一包装 */
export interface PanelShellProps {
  isOpen: boolean;
  panelShellClass: string;
  panelShellStyle: React.CSSProperties | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResizeStart: (e: React.MouseEvent) => void;
}

/** Panel 共享 props */
export interface PanelProps {
  activeTab: Tab;
  messages: Message[];
  isNightMode: boolean;
  onPreviewFile?: (linkPath: string, sourceFilePath?: string) => void;
}

/**
 * PanelShell：包一层 aside + resize handle
 * 大多数 panel 不需要管 shell，只负责自己的内容；只有当 isOpen=false 时不渲染
 */
export const PanelShell = React.memo(function PanelShell({
  isOpen,
  panelShellClass,
  panelShellStyle,
  containerRef,
  onResizeStart,
  children,
}: PanelShellProps & { children: React.ReactNode }) {
  // 不在 isOpen=false 时卸载 aside —— 保留 DOM 让 width transition (200ms) 跑完
  // 关闭时 panelShellClass 已经有 w-0 + border-l-transparent 隐藏；isOpen=true 时 width=rightPanelWidth 显示
  // resize handle 在 isOpen=false 时不渲染（避免点击 0 宽元素）
  return (
    <aside ref={containerRef} className={panelShellClass} style={panelShellStyle}>
      {isOpen && (
        <div
          className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors"
          onMouseDown={onResizeStart}
        />
      )}
      {isOpen && children}
    </aside>
  );
});

/**
 * 类型注册表（v0.5.14 引入）：
 *  - 用 `{ [K in TabType]: ComponentType<PanelProps> }` 强制覆盖所有 TabType
 *  - 加新 type 漏配组件时 TS 编译报错（exhaustiveness check）
 */
type RendererMap = {
  [K in TabType]: React.ComponentType<PanelProps>;
};

const renderers: RendererMap = {
  overview: OverviewPanel,
  image: ImagePanel,
  bash: BashPanel,
  markdown: MarkdownPanel,
  tool_result: FilePanel,
};

export function renderPanel(props: PanelProps) {
  const Renderer = renderers[props.activeTab.type];
  return <Renderer {...props} />;
}

export { OverviewPanel, ImagePanel, BashPanel, MarkdownPanel, FilePanel };
