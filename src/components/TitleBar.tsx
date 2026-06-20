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
  tabs: Tab[];
  activeTabId: string;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onNavigate: (delta: number) => void;
  onSettingsOpen: () => void;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string, e: React.MouseEvent) => void;
  showToast: (message: string) => void;
  isNightMode: boolean;
  onToggleNightMode: () => void;
  rightPanelWidth: number;
}

export default function TitleBar({
  isLeftSidebarOpen,
  isRightSidebarOpen,
  activeSession,
  hasActiveSession,
  tabs,
  activeTabId,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onNavigate,
  onSettingsOpen,
  onTabClick,
  onTabClose,
  showToast,
  isNightMode,
  onToggleNightMode,
  rightPanelWidth,
}: TitleBarProps) {
  return (
    <div className="custom-titlebar" data-tauri-drag-region>
      {/* 左侧控制区 */}
      <div className={`titlebar-left ${isLeftSidebarOpen ? "" : "collapsed"}`} data-tauri-drag-region>
        <div className="titlebar-left-controls" data-tauri-drag-region>
          <button className="titlebar-btn" onClick={onToggleLeftSidebar}>
            <Icons.SidebarToggle />
          </button>
          <button className="titlebar-btn" onClick={() => onNavigate(-1)}>
            <Icons.ChevronLeft />
          </button>
          <button className="titlebar-btn" onClick={() => onNavigate(1)}>
            <Icons.ChevronRight />
          </button>
        </div>
      </div>

      {/* 右侧区域 */}
      <div className={`titlebar-right ${isLeftSidebarOpen ? "" : "collapsed"}`} data-tauri-drag-region style={{ display: "flex", padding: 0, alignItems: "center" }}>
        {/* 中间部分（聊天区上方） */}
        <div className="titlebar-middle" data-tauri-drag-region>
          <div className="titlebar-breadcrumbs" data-tauri-drag-region style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            <span className="titlebar-breadcrumb-session">{activeSession ? activeSession.title : "New Conversation"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "100%" }}>
            {hasActiveSession && activeSession && (
              <button className="titlebar-btn" style={{ background: "#f2f2f7", border: "1px solid #e3e3e3" }} onClick={() => showToast("待开发")}>
                <Icons.IDE />
                Open IDE
              </button>
            )}
          </div>
        </div>

        {/* 右侧面板标题栏（在右侧边栏打开时可见） */}
        {hasActiveSession && activeSession && isRightSidebarOpen && (
          <div className="titlebar-right-panel-header" data-tauri-drag-region style={{ width: rightPanelWidth, minWidth: rightPanelWidth }}>
            {/* Tab 标签容器 */}
            <div className="right-panel-tabs">
              {tabs.map((tab, index) => {
                const isActive = activeTabId === tab.id;

                let tabIcon = null;
                if (tab.id === "overview") {
                  tabIcon = <Icons.ListIcon />;
                } else if (tab.title === "Walkthrough") {
                  tabIcon = <Icons.BookIcon />;
                } else if (tab.title.endsWith(".rs")) {
                  tabIcon = <span className="rust-tab-icon">R</span>;
                } else {
                  tabIcon = <Icons.FileCode />;
                }

                return (
                  <React.Fragment key={tab.id}>
                    {index > 0 && !isActive && activeTabId !== tabs[index - 1].id && (
                      <div className="tab-separator" />
                    )}
                    <div
                      className={`panel-tab ${isActive ? "active" : ""}`}
                      onClick={() => onTabClick(tab.id)}
                    >
                      {tabIcon}
                      <span>{tab.title}</span>
                      {tab.id !== "overview" && (
                        <span
                          onClick={(e) => onTabClose(tab.id, e)}
                          className="close-tab-btn"
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
            <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0, paddingLeft: "6px" }}>
              <button
                className={`titlebar-btn${isNightMode ? " active" : ""}`}
                onClick={onToggleNightMode}
                title={isNightMode ? "切换为日间模式" : "切换为夜间模式"}
                style={{ padding: "4px" }}
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
              <button className="titlebar-btn" onClick={onSettingsOpen} style={{ padding: "4px" }}>
                <Icons.Settings />
              </button>
              <button className={`titlebar-btn ${isRightSidebarOpen ? "active" : ""}`} onClick={() => onToggleRightSidebar()} style={{ padding: "4px" }}>
                <Icons.RightSidebarToggle />
              </button>
            </div>
          </div>
        )}

        {/* 右侧边栏关闭时的切换按钮 */}
        {hasActiveSession && activeSession && !isRightSidebarOpen && (
          <div className="titlebar-actions" style={{ paddingRight: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className={`titlebar-btn${isNightMode ? " active" : ""}`}
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
            <button className="titlebar-btn" onClick={onToggleRightSidebar}>
              <Icons.RightSidebarToggle />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
