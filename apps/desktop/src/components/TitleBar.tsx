import React from "react";
import { Session } from "@/bridge";
import * as Icons from "@/components/Icons";

/** 右侧操作按钮（设置、夜间模式、更新、切换 RightPanel）—— 在 right panel 开/关时位置和显示一致 */
function RightActions({
  isRightSidebarOpen,
  isUpdateReady,
  isNightMode,
  onSettingsOpen,
  onToggleNightMode,
  onToggleRightSidebar,
  onRestartToUpdate,
}: Pick<TitleBarProps,
  "isRightSidebarOpen" | "isUpdateReady" | "isNightMode" |
  "onSettingsOpen" | "onToggleNightMode" | "onToggleRightSidebar" | "onRestartToUpdate"
>) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {isUpdateReady && (
        <button
          className="inline-flex items-center justify-center bg-brand-blue hover:bg-brand-blue-hover text-white border-0 rounded-full px-4 text-[11.5px] font-semibold cursor-pointer h-6 whitespace-nowrap transition-all duration-200 hover:-translate-y-[0.5px] active:translate-y-[0.5px] mr-1.5"
          onClick={onRestartToUpdate}
        >
          Restart to Update →
        </button>
      )}
      <button
        className={`bg-transparent border-0 cursor-pointer text-label-secondary flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-inverse ${
          isNightMode ? "text-brand-blue" : ""
        }`}
        onClick={onToggleNightMode}
        title={isNightMode ? "切换为日间模式" : "切换为夜间模式"}
      >
        {isNightMode ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>
      <button
        className="bg-transparent border-0 cursor-pointer text-label-secondary flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-inverse"
        onClick={onSettingsOpen}
      >
        <Icons.Settings />
      </button>
      <button
        className={`bg-transparent border-0 cursor-pointer text-label-secondary flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-inverse ${
          isRightSidebarOpen ? "bg-surface-secondary dark:bg-surface-secondary text-label-primary dark:text-label-inverse" : ""
        }`}
        onClick={onToggleRightSidebar}
      >
        <Icons.RightSidebarToggle />
      </button>
    </div>
  );
}

interface Tab {
  id: string;
  title: string;
  type: string;
  content: string;
  language?: string;
}

interface TitleBarProps {
  isLeftSidebarOpen: boolean;
  isRightSidebarOpen: boolean;
  activeSession: Session | undefined;
  planMode?: boolean;
  isHistoryPage?: boolean;
  isTasksPage?: boolean;
  tabs: Tab[];
  activeTabId: string;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onNavigate: (delta: number) => void;
  onSettingsOpen: () => void;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string, e: React.MouseEvent) => void;
  isNightMode: boolean;
  onToggleNightMode: () => void;
  rightPanelWidth: number;
  leftSidebarWidth: number;
  isLeftSidebarDragging?: boolean;
  isRightSidebarDragging?: boolean;
  isUpdateReady?: boolean;
  onRestartToUpdate?: () => void;
}

export default function TitleBar({
  isLeftSidebarOpen,
  isRightSidebarOpen,
  activeSession,
  planMode,
  isHistoryPage,
  isTasksPage,
  tabs,
  activeTabId,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onNavigate,
  onSettingsOpen,
  onTabClick,
  onTabClose,
  isNightMode,
  onToggleNightMode,
  rightPanelWidth,
  leftSidebarWidth,
  isLeftSidebarDragging,
  isRightSidebarDragging,
  isUpdateReady,
  onRestartToUpdate,
}: TitleBarProps) {
  return (
    <div className="flex h-[38px] bg-transparent border-b border-border-primary select-none shrink-0 z-[1000]" data-tauri-drag-region>
      {/* 左侧控制区（镜像 LeftSidebar 宽度） */}
      <div
        className={`bg-surface-active dark:bg-surface-primary border-r border-border-primary h-full shrink-0 transition-[border-right-color] duration-200 overflow-hidden ${
          isLeftSidebarOpen ? "" : "border-r-transparent"
        } ${
          isLeftSidebarDragging ? "" : "transition-[width]"
        }`}
        data-tauri-drag-region
        style={isLeftSidebarOpen ? { width: `${leftSidebarWidth}px` } : undefined}
      >
        <div className="flex items-start gap-1.5 h-full pl-[80px] pt-[2px]" data-tauri-drag-region>
          <button 
            className="bg-transparent border-0 cursor-pointer text-label-secondary flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-inverse" 
            onClick={onToggleLeftSidebar}
          >
            <Icons.SidebarToggle />
          </button>
          <button 
            className="bg-transparent border-0 cursor-pointer text-label-secondary flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-inverse" 
            onClick={() => onNavigate(-1)}
          >
            <Icons.ChevronLeft />
          </button>
          <button 
            className="bg-transparent border-0 cursor-pointer text-label-secondary flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-inverse" 
            onClick={() => onNavigate(1)}
          >
            <Icons.ChevronRight />
          </button>
        </div>
      </div>

      {/* 右侧区域 */}
      <div 
        className={`relative flex-1 flex items-center justify-between px-4 pt-[2px] h-full transition-[background-color] duration-200 ${
          isLeftSidebarOpen ? "bg-surface-primary" : "bg-surface-active dark:bg-surface-primary"
        }`} 
        data-tauri-drag-region
      >
        {/* 中间部分（聊天区上方） */}
        <div className="flex-1 h-full flex items-center justify-between min-w-0 pr-4" data-tauri-drag-region>
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" data-tauri-drag-region>
            <span className="text-xs font-semibold text-label-primary dark:text-label-primary truncate">
              {activeSession ? activeSession.title : isHistoryPage ? "Conversation History" : isTasksPage ? "Scheduled Tasks" : "New Conversation"}
            </span>
            {planMode && (
              <span 
                className="text-[10px] px-1.5 py-0.5 font-bold tracking-wider rounded-sm text-brand-blue bg-brand-blue/10 border border-brand-blue/25 dark:text-deepseek-400 dark:bg-deepseek-400/12 dark:border-deepseek-400/30 whitespace-nowrap select-none" 
                title="规划模式 — 只读分析"
              >
                📋 Plan
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 h-full">
          </div>
        </div>

        {/* 右侧区域（v0.5.14: tab 容器宽度 = rightPanelWidth - 120，actions 固定 120px） */}
        <div
          className={`h-full border-l border-border-primary flex items-center pl-3 pr-0 box-border overflow-hidden shrink-0 ${
            isRightSidebarOpen ? "" : "w-0 border-r-transparent border-l-transparent transition-[width] duration-200"
          } ${
            isRightSidebarDragging ? "" : "transition-[width] duration-200"
          }`}
          data-tauri-drag-region
          // tab 容器宽度 = rightPanelWidth - 120：
          // - 120 = actions 容器宽度 (104) + 16px 视觉间隔（不渲染 padding，靠外层 gap 留出）
          // - tab 内容渲染到 rightPanelWidth - 120，与 RightPanel 内容宽度对齐（RightPanel 无 pr-4）
          style={isRightSidebarOpen ? { width: `${Math.max(0, rightPanelWidth - 120)}px` } : undefined}
        >
          {/* Tab 标签容器（占满容器剩余空间） */}
          <div className="flex items-end h-full min-w-0 w-full overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const isActive = activeTabId === tab.id;

              let tabIcon = null;
              if (tab.id === "overview") {
                tabIcon = <Icons.ListIcon />;
              } else if (tab.title === "Walkthrough") {
                tabIcon = <Icons.BookIcon />;
              } else if (tab.title.endsWith(".rs")) {
                tabIcon = <span className="text-[10px] font-bold text-orange-500 mr-1">R</span>;
              } else {
                tabIcon = <Icons.FileCode />;
              }

              return (
                <div
                  key={tab.id}
                  className={`flex items-center gap-1.5 px-3.5 h-7 text-xs border-r border-border-primary border-t-2 border-t-transparent cursor-pointer bg-surface-active dark:bg-surface-primary shrink-0 hover:bg-surface-active dark:hover:bg-[#252528] hover:text-label-primary dark:hover:text-label-inverse ${
                    isActive
                      ? "bg-surface-primary text-label-primary dark:text-label-inverse border-t-brand-blue font-medium"
                      : "text-label-secondary"
                  }`}
                  onClick={() => onTabClick(tab.id)}
                  onContextMenu={(e) => {
                    if (tab.id !== "overview") {
                      e.preventDefault();
                      onTabClose(tab.id, e as unknown as React.MouseEvent);
                    }
                  }}
                >
                  {tabIcon}
                  <span className="truncate max-w-[140px]">{tab.title}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* actions 固定 104px（无 padding），位置始终在最右 */}
        <div className="flex items-center h-7 shrink-0" style={{ width: "104px" }}>
          <RightActions
            isRightSidebarOpen={isRightSidebarOpen}
            isUpdateReady={isUpdateReady}
            isNightMode={isNightMode}
            onSettingsOpen={onSettingsOpen}
            onToggleNightMode={onToggleNightMode}
            onToggleRightSidebar={onToggleRightSidebar}
            onRestartToUpdate={onRestartToUpdate}
          />
        </div>
      </div>
    </div>
  );
}
