import React from "react";
import { Message } from "@/bridge";
import { OverviewPanel } from "./OverviewPanel";
import { ImagePanel } from "./ImagePanel";
import { BashPanel } from "./BashPanel";
import { MarkdownPanel } from "./MarkdownPanel";
import { FilePanel } from "./FilePanel";
import type { Tab, PanelShellProps } from "./PanelShell";

/** 所有 panel 类型共享的 props */
export interface PanelProps {
  activeTab: Tab;
  messages: Message[];
  isNightMode: boolean;
  onPreviewFile?: (linkPath: string, sourceFilePath?: string) => void;
  /** PanelShell 外壳属性（aside className/style + resize handle） */
  shell: PanelShellProps;
}

/**
 * 类型注册表（v0.5.14 引入）：
 *  - 用 `{ [K in TabType]: ComponentType<PanelProps> }` 强制覆盖所有 TabType
 *  - 加新 type 漏配组件时 TS 编译报错（exhaustiveness check）
 *  - MarkdownPanel / FilePanel 自己渲染 aside，其他 panel 用 PanelShell 包装
 */
type RendererMap = {
  [K in Tab["type"]]: React.ComponentType<PanelProps>;
};

const renderers: RendererMap = {
  overview: OverviewPanel,
  image: ImagePanel,
  bash: BashPanel,
  markdown: MarkdownPanel,
  tool_result: FilePanel,
};

/** 渲染当前 activeTab 对应的 panel（v0.5.14 取代旧的 if/else ladder） */
export function renderPanel(props: PanelProps) {
  const Renderer = renderers[props.activeTab.type];
  return <Renderer {...props} />;
}
