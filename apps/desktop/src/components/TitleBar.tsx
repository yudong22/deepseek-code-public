import React from "react";
import { Session } from "@/bridge";
import * as Icons from "@/components/Icons";

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
  hasActiveSession: boolean;
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
  isUpdateReady?: boolean;
  onRestartToUpdate?: () => void;
}

export default function TitleBar({
  isLeftSidebarOpen,
  isRightSidebarOpen,
  activeSession,
  hasActiveSession,
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
  isUpdateReady,
  onRestartToUpdate,
}: TitleBarProps) {
  return (
    <div className="flex h-[38px] bg-transparent border-b border-[#e3e3e3] dark:border-[#2c2c2e] select-none shrink-0 z-[1000]" data-tauri-drag-region>
      {/* 左侧控制区 */}
      <div 
        className={`w-[260px] bg-[#f6f6f6] dark:bg-[#1c1c1e] border-r border-[#e3e3e3] dark:border-[#2c2c2e] h-full shrink-0 transition-[border-right-color] duration-200 overflow-hidden ${
          isLeftSidebarOpen ? "" : "border-r-transparent"
        }`} 
        data-tauri-drag-region
      >
        <div className="flex items-start gap-1.5 h-full pl-[80px] pt-[2px]" data-tauri-drag-region>
          <button 
            className="bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white" 
            onClick={onToggleLeftSidebar}
          >
            <Icons.SidebarToggle />
          </button>
          <button 
            className="bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white" 
            onClick={() => onNavigate(-1)}
          >
            <Icons.ChevronLeft />
          </button>
          <button 
            className="bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white" 
            onClick={() => onNavigate(1)}
          >
            <Icons.ChevronRight />
          </button>
        </div>
      </div>

      {/* 右侧区域 */}
      <div 
        className={`relative flex-1 flex items-center justify-between px-4 pt-[2px] h-full transition-[background-color] duration-200 ${
          isLeftSidebarOpen ? "bg-white dark:bg-[#1c1c1e]" : "bg-[#f6f6f6] dark:bg-[#1c1c1e]"
        }`} 
        data-tauri-drag-region
      >
        {/* 中间部分（聊天区上方） */}
        <div className="flex-1 h-full flex items-center justify-between min-w-0 pr-4" data-tauri-drag-region>
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" data-tauri-drag-region>
            <span className="text-xs font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] truncate">
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

        {/* 右侧面板标题栏（在右侧边栏打开时可见） */}
        {hasActiveSession && activeSession && isRightSidebarOpen && (
          <div 
            className="h-full border-l border-[#e3e3e3] dark:border-[#2c2c2e] flex items-center justify-between pl-3 box-border" 
            data-tauri-drag-region 
            style={{ width: rightPanelWidth, minWidth: rightPanelWidth }}
          >
            {/* Tab 标签容器 */}
            <div className="flex items-end h-full min-w-0 overflow-x-auto no-scrollbar">
              {tabs.map((tab, index) => {
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
                  <React.Fragment key={tab.id}>
                    {index > 0 && !isActive && activeTabId !== tabs[index - 1].id && (
                      <div className="w-[1px] h-3 bg-[#e3e3e3] dark:bg-[#2c2c2e] self-center shrink-0" />
                    )}
                    <div
                      className={`flex items-center gap-1.5 px-3.5 h-7 text-xs border-r border-[#e3e3e3] dark:border-[#2c2c2e] border-t-2 border-t-transparent cursor-pointer bg-[#f6f6f6] dark:bg-[#1c1c1e] shrink-0 hover:bg-[#efeff4] dark:hover:bg-[#252528] hover:text-[#111] dark:hover:text-white ${
                        isActive 
                          ? "bg-white dark:bg-[#1c1c1e] text-[#111] dark:text-white border-t-brand-blue font-medium" 
                          : "text-[#555] dark:text-[#a0a0a5]"
                      }`}
                      onClick={() => onTabClick(tab.id)}
                    >
                      {tabIcon}
                      <span>{tab.title}</span>
                      {tab.id !== "overview" && (
                        <span
                          onClick={(e) => onTabClose(tab.id, e)}
                          className="ml-1 p-0.5 text-[9px] text-[#8e8e93] hover:text-[#ff3b30] hover:bg-[#e5e5ea] dark:hover:bg-[#2c2c2e] rounded-full flex items-center justify-center w-3 h-3"
                        >
                          ✕
                        </span>
                      )}
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-0.5 shrink-0 pl-1.5">
              {isUpdateReady && (
                <button 
                  className="inline-flex items-center justify-center bg-brand-blue hover:bg-brand-blue-hover text-white border-0 rounded-full px-4 text-[11.5px] font-semibold cursor-pointer h-6 whitespace-nowrap transition-all duration-200 hover:-translate-y-[0.5px] active:translate-y-[0.5px] mr-1.5" 
                  onClick={onRestartToUpdate}
                >
                  Restart to Update →
                </button>
              )}
              <button
                className={`bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white ${
                  isNightMode ? "text-brand-blue" : ""
                }`}
                onClick={onToggleNightMode}
                title={isNightMode ? "切换为日间模式" : "切换为夜间模式"}
              >
                {isNightMode ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                )}
              </button>
              <button 
                className="bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white" 
                onClick={onSettingsOpen}
              >
                <Icons.Settings />
              </button>
              <button 
                className={`bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white ${
                  isRightSidebarOpen ? "bg-[#f2f2f7] dark:bg-[#2c2c2e] text-[#111] dark:text-white" : ""
                }`} 
                onClick={() => onToggleRightSidebar()}
              >
                <Icons.RightSidebarToggle />
              </button>
            </div>
          </div>
        )}

        {/* 右侧边栏关闭时的切换按钮 */}
        {hasActiveSession && activeSession && !isRightSidebarOpen && (
          <div className="flex items-center gap-2 h-7 pr-4">
            {isUpdateReady && (
              <button 
                className="inline-flex items-center justify-center bg-brand-blue hover:bg-brand-blue-hover text-white border-0 rounded-full px-4 text-[11.5px] font-semibold cursor-pointer h-6 whitespace-nowrap transition-all duration-200 hover:-translate-y-[0.5px] active:translate-y-[0.5px]" 
                onClick={onRestartToUpdate}
              >
                Restart to Update →
              </button>
            )}
            <button
              className={`bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white ${
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
              className="bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white" 
              onClick={onToggleRightSidebar}
            >
              <Icons.RightSidebarToggle />
            </button>
          </div>
        )}

        {!hasActiveSession && (
          <div className="flex items-center gap-2 h-7 ml-auto pr-4">
            {isUpdateReady && (
              <button 
                className="inline-flex items-center justify-center bg-brand-blue hover:bg-brand-blue-hover text-white border-0 rounded-full px-4 text-[11.5px] font-semibold cursor-pointer h-6 whitespace-nowrap transition-all duration-200 hover:-translate-y-[0.5px] active:translate-y-[0.5px]" 
                onClick={onRestartToUpdate}
              >
                Restart to Update →
              </button>
            )}
            <button
              className={`bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white ${
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
              className="bg-transparent border-0 cursor-pointer text-[#555] dark:text-[#a0a0a5] flex items-center justify-center p-1.5 rounded-sm text-xs font-medium gap-1.5 h-7 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] hover:text-[#111] dark:hover:text-white" 
              onClick={onSettingsOpen}
            >
              <Icons.Settings />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
