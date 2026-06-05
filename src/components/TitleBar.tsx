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
          <div className="titlebar-right-panel-header" data-tauri-drag-region>
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
            <button className="titlebar-btn" onClick={onToggleRightSidebar}>
              <Icons.RightSidebarToggle />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
