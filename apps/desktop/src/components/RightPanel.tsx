import { useMemo } from "react";
import { Message } from "@/bridge";
import { useResizable } from "@/hooks/useResizable";
import { PanelShell, renderPanel } from "./RightPanel/PanelShell";
import type { Tab } from "./RightPanel/PanelShell";

interface RightPanelProps {
  isOpen: boolean;
  tabs: Tab[];
  activeTabId: string;
  messages: Message[];
  width: number;
  onWidthChange: (w: number) => void;
  isNightMode: boolean;
  /** 点击 markdown 中 file:// 链接时调用（递归预览） */
  onPreviewFile?: (linkPath: string, sourceFilePath?: string) => void;
  /** 拖动状态变化回调（用于 TitleBar 镜像时去掉 width transition） */
  onIsResizingChange?: (resizing: boolean) => void;
}

const MIN_WIDTH = 240;
const MAX_WIDTH = 900;

export default function RightPanel({
  isOpen,
  tabs,
  activeTabId,
  messages,
  width,
  onWidthChange,
  isNightMode,
  onPreviewFile,
  onIsResizingChange,
}: RightPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // --- 拖拽宽度 (v0.5.14 改用 useResizable) ---
  // 注意：拖动期间 useResizable 内部 rAF 节流 + setState 触发 re-render
  // 受控模式：drag 期间 useResizable 维护内部 width；mouseup 时调用 onCommit
  // 同步到外部 width。外部 width 变化（如设置面板重置）通过 effect 同步到 useResizable 内部。
  const resizable = useResizable({
    initial: width,
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    anchor: "right",
    onCommit: onWidthChange,
    onDraggingChange: onIsResizingChange,
  });

  // PanelShell 通用属性：拖动时禁用 width transition（不然会"慢一拍"），平时保留 200ms 平滑动画
  const panelShellClass = isOpen
    ? `flex flex-col bg-surface-primary h-full shrink-0 relative border-l border-border-primary overflow-hidden ${
        resizable.isDragging ? "" : "transition-[width] duration-200"
      }`
    : "w-0 border-l-transparent pointer-events-none shrink-0 transition-[width] duration-200";
  const panelShellStyle = isOpen ? { width: `${width}px` } : undefined;
  const shell = { isOpen, panelShellClass, panelShellStyle, containerRef: resizable.containerRef, onResizeStart: resizable.onResizeStart };

  // 关键优化：缓存 panel 内容。拖动期间只有 width 变化，activeTab/messages/isNightMode/onPreviewFile 都不变
  // —— useMemo 让 PanelShell 的 children prop 在拖动期间保持同一引用
  // 配合 PanelShell 的 React.memo，避免整个 renderPanel 子树重新渲染
  const panelContent = useMemo(
    () =>
      renderPanel({
        activeTab,
        messages,
        isNightMode,
        onPreviewFile,
      }),
    [activeTab, messages, isNightMode, onPreviewFile],
  );

  return <PanelShell {...shell}>{panelContent}</PanelShell>;
}
