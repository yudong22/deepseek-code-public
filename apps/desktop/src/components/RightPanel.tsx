import { useEffect } from "react";
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
}: RightPanelProps) {
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // --- 拖拽宽度 (v0.5.14 改用 useResizable) ---
  const resizable = useResizable({
    initial: width,
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    anchor: "right",
    onCommit: onWidthChange,
  });
  // 外部 width 变化时同步到容器 DOM
  useEffect(() => {
    const el = resizable.containerRef.current;
    if (el) el.style.width = `${width}px`;
  }, [width, resizable.containerRef]);

  // PanelShell 通用属性
  const panelShellClass = isOpen
    ? "flex flex-col bg-surface-primary h-full shrink-0 relative transition-[width] duration-200 border-l border-border-primary overflow-hidden"
    : "w-0 border-l-transparent pointer-events-none shrink-0";
  const panelShellStyle = isOpen ? { width: `${width}px` } : undefined;
  const shell = { isOpen, panelShellClass, panelShellStyle, containerRef: resizable.containerRef, onResizeStart: resizable.onResizeStart };

  return (
    <PanelShell {...shell}>
      {renderPanel({
        activeTab,
        messages,
        isNightMode,
        onPreviewFile,
      })}
    </PanelShell>
  );
}
