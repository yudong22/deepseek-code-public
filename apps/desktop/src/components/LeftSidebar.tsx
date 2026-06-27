import { useState } from "react";
import { Session } from "@/bridge";
import * as Icons from "@/components/Icons";

interface LeftSidebarProps {
  isOpen: boolean;
  sessions: Session[];
  activeSessionId: string | undefined;
  onNewConversation: () => void;
  onSelectSession: (id: string) => void;
  onSettingsOpen: () => void;
  onHistoryOpen: () => void;
  onTasksOpen: () => void;
  showToast: (message: string) => void;
  projects: string[];
  activeWorkspacePath: string;
  collapsedProjects: Record<string, boolean>;
  onToggleProjectCollapse: (projectName: string) => void;
  onAddProject: () => void;
  onRemoveProject: (projectPath: string) => void;
  onSelectProject: (projectPath: string) => void;
}

/** 根据更新时间生成相对时间标签 */
function getSessionTimeLabel(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return `${diffDays}d`;
}

function getProjectNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export default function LeftSidebar({
  isOpen,
  sessions,
  activeSessionId,
  onNewConversation,
  onSelectSession,
  onSettingsOpen,
  onHistoryOpen,
  onTasksOpen,
  showToast,
  projects,
  activeWorkspacePath,
  collapsedProjects,
  onToggleProjectCollapse,
  onAddProject,
  onRemoveProject,
  onSelectProject,
}: LeftSidebarProps) {
  const [expandedProjectsAll, setExpandedProjectsAll] = useState<Record<string, boolean>>({});

  const toggleExpandAll = (projectName: string) => {
    setExpandedProjectsAll(prev => ({
      ...prev,
      [projectName]: !prev[projectName]
    }));
  };

  const projectMap = new Map<string, string>();
  projects.forEach(p => {
    projectMap.set(getProjectNameFromPath(p), p);
  });
  const importedProjectNames = Array.from(projectMap.keys());

  const allSessionProjectNames = Array.from(
    new Set(sessions.map((s) => s.projectName).filter(Boolean))
  ) as string[];
  
  const missingProjectNames = allSessionProjectNames.filter(
    (name) => !importedProjectNames.includes(name)
  );

  const generalSessions = sessions.filter(
    (s) => !s.projectName || (!importedProjectNames.includes(s.projectName) && !missingProjectNames.includes(s.projectName))
  );

  const renderProjectSessions = (projectName: string) => {
    const projectSessions = sessions.filter(s => s.projectName === projectName);
    if (projectSessions.length === 0) {
      return (
        <div style={{ padding: "6px 12px 6px 28px", fontSize: "11px", color: "#8e8e93", fontStyle: "italic" }}>
          暂无历史会话
        </div>
      );
    }

    const showAll = expandedProjectsAll[projectName];
    const visibleSessions = showAll ? projectSessions : projectSessions.slice(0, 5);

    return (
      <div className="folder-sessions">
        {visibleSessions.map((s) => (
          <div
            key={s.id}
            className={`session-link ${activeSessionId === s.id ? "active" : ""}`}
            onClick={() => onSelectSession(s.id)}
          >
            <span className="session-title-text" style={{ fontWeight: "normal" }}>
              {s.title}
            </span>
            <span className="session-time">{getSessionTimeLabel(s.updatedAt)}</span>
          </div>
        ))}
        {projectSessions.length > 5 && !showAll && (
          <div
            className="session-link see-all-btn"
            onClick={() => toggleExpandAll(projectName)}
            style={{ color: "#007aff", fontWeight: "500", fontSize: "11px", paddingLeft: "12px", display: "flex", alignItems: "center" }}
          >
            See all ({projectSessions.length})
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={`left-sidebar ${isOpen ? "" : "collapsed"}`}>
      {/* 新建对话按钮 */}
      <div className="new-conv-btn-container">
        <button className="new-conv-btn" onClick={onNewConversation}>
          <Icons.Plus />
          New Conversation
        </button>
      </div>

      {/* 静态导航 */}
      <div className="sidebar-nav">
        <div className="nav-item" onClick={onHistoryOpen}>
          <Icons.History />
          Conversation History
        </div>
        <div className="nav-item" onClick={onTasksOpen}>
          <Icons.Tasks />
          Scheduled Tasks
        </div>
      </div>

      {/* 可滚动区域 */}
      <div className="sidebar-scroll">
        <div className="section-title" style={{ cursor: "default" }}>
          <span>Projects</span>
          <div className="section-title-tools">
            <Icons.Filter />
            <div style={{ cursor: "pointer", display: "flex", alignItems: "center" }} onClick={onAddProject} title="导入项目文件夹">
              <Icons.FolderPlus />
            </div>
          </div>
        </div>

        <div className="projects-list" style={{ padding: "4px 0" }}>
          {projects.map((projectPath) => {
            const name = getProjectNameFromPath(projectPath);
            const isCollapsed = !!collapsedProjects[name];
            const isActive = activeWorkspacePath === projectPath;
            return (
              <div key={projectPath} className="folder-item">
                <div className="folder-header-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div
                    className={`folder-header ${isActive ? "active" : ""}`}
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", paddingLeft: "12px" }}
                    onClick={() => {
                      if (isActive) {
                        onToggleProjectCollapse(name);
                      } else {
                        onSelectProject(projectPath);
                      }
                    }}
                    title={`点击切换到工作区: ${projectPath}`}
                  >
                    {isCollapsed ? <Icons.Folder /> : <Icons.FolderOpen />}
                    <span className="folder-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>
                      {name}
                    </span>
                  </div>
                  <button
                    className="remove-project-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveProject(projectPath);
                    }}
                    title="移除项目"
                    style={{
                      background: "none",
                      border: "none",
                      color: "#ff3b30",
                      cursor: "pointer",
                      fontSize: "13px",
                      marginRight: "16px",
                      display: "flex",
                      alignItems: "center"
                    }}
                  >
                    ✕
                  </button>
                </div>
                {!isCollapsed && renderProjectSessions(name)}
              </div>
            );
          })}

          {missingProjectNames.map((name) => {
            const isCollapsed = !!collapsedProjects[name];
            return (
              <div key={name} className="folder-item missing-project">
                <div className="folder-header-wrapper" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div
                    className="folder-header"
                    style={{ flex: 1, display: "flex", alignItems: "center", gap: "6px", opacity: 0.65, paddingLeft: "12px" }}
                    onClick={() => {
                      onToggleProjectCollapse(name);
                      showToast(`项目 "${name}" 未导入，请点击右上角 "+" 选择该文件夹以重新绑定。`);
                    }}
                    title="未导入/找不到物理文件夹，点击以重新关联"
                  >
                    {isCollapsed ? <Icons.Folder /> : <Icons.FolderOpen />}
                    <span className="folder-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
                      {name} <span style={{ fontSize: "10px", color: "#8e8e93" }}>(未导入)</span>
                    </span>
                  </div>
                </div>
                {!isCollapsed && renderProjectSessions(name)}
              </div>
            );
          })}

          {projects.length === 0 && missingProjectNames.length === 0 && (
            <div style={{ padding: "8px 16px", fontSize: "11px", color: "#8a8a8f", textAlign: "left" }}>
              点击右上角图标导入项目文件夹
            </div>
          )}
        </div>

        <div className="conversations-section" style={{ marginTop: "12px" }}>
          <div className="conversations-title">Conversations</div>
          <div className="conversations-list">
            {generalSessions.map((s) => (
              <div
                key={s.id}
                className={`session-link ${activeSessionId === s.id ? "active" : ""}`}
                onClick={() => onSelectSession(s.id)}
              >
                <span className="session-title-text" style={{ fontWeight: "normal" }}>
                  {s.title}
                </span>
                <span className="session-time">{getSessionTimeLabel(s.updatedAt)}</span>
              </div>
            ))}
            {generalSessions.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: "11px", color: "#8a8a8f" }}>
                暂无普通历史会话
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="nav-item" onClick={onSettingsOpen}>
          <Icons.Settings />
          Settings
        </div>
      </div>
    </aside>
  );
}
