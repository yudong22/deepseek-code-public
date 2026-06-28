import { useState } from "react";
import { Session } from "@/bridge";
import * as Icons from "@/components/Icons";
import { useResizable } from "@/hooks/useResizable";

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 260;

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
  onOpenSettingsForProject: (projectPath: string) => void;
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
  onOpenSettingsForProject,
  onSelectProject,
}: LeftSidebarProps) {
  const [expandedProjectsAll, setExpandedProjectsAll] = useState<Record<string, boolean>>({});

  // --- 可拖拽调整宽度 (v0.5.14 改用 useResizable hook) ---
  const resizable = useResizable({
    initial: DEFAULT_WIDTH,
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    anchor: "left", // 容器靠左，handle 在右，drag right = wider
  });

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
        <div className="pl-7 pr-3 py-1.5 text-[13px] text-[#8e8e93] italic">
          暂无历史会话
        </div>
      );
    }

    const showAll = expandedProjectsAll[projectName];
    const visibleSessions = showAll ? projectSessions : projectSessions.slice(0, 5);

    return (
      <div className="pl-4 flex flex-col gap-0.5">
        {visibleSessions.map((s) => (
          <div
            key={s.id}
            className={`flex items-center justify-between px-3 h-7 text-[13px] rounded-md cursor-pointer select-none transition-colors ${
              activeSessionId === s.id 
                ? "bg-surface-secondary text-[#111] dark:text-white font-medium" 
                : "text-label-secondary dark:text-label-secondary hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary"
            }`}
            onClick={() => onSelectSession(s.id)}
          >
            <span className="truncate flex-1 pr-2 font-normal">
              {s.title}
            </span>
            <span className="text-[12px] text-[#8e8e93] shrink-0">{getSessionTimeLabel(s.updatedAt)}</span>
          </div>
        ))}
        {projectSessions.length > 5 && !showAll && (
          <div
            className="flex items-center h-7 text-brand-blue dark:text-deepseek-400 font-medium text-[13px] pl-3 cursor-pointer"
            onClick={() => toggleExpandAll(projectName)}
          >
            See all ({projectSessions.length})
          </div>
        )}
      </div>
    );
  };

  return (
    <aside
      ref={resizable.containerRef}
      className={`bg-surface-primary border-r border-border-primary flex flex-col h-full shrink-0 overflow-hidden relative transition-[width] duration-200 ${isOpen ? "" : "w-0 border-r-transparent"}`}
      style={isOpen ? { width: `${resizable.width}px` } : undefined}
    >
      {/* 新建对话按钮 */}
      <div className="p-4 shrink-0">
        <button 
          className="w-full h-9 flex items-center justify-center gap-2 bg-[#ebebeb] hover:bg-[#e0e0e0] dark:bg-surface-secondary hover:bg-surface-hover text-[#333] dark:text-[#d0d0d0] rounded-md text-[13px] font-medium cursor-pointer select-none transition-colors border-0" 
          onClick={onNewConversation}
        >
          <Icons.Plus />
          New Conversation
        </button>
      </div>

      {/* 静态导航 */}
      <div className="px-2 py-1 flex flex-col gap-0.5 shrink-0">
        <div 
          className="flex items-center gap-3 px-3 h-8 text-[13px] text-label-secondary dark:text-label-secondary rounded-md cursor-pointer select-none hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary transition-colors" 
          onClick={onHistoryOpen}
        >
          <Icons.History />
          Conversation History
        </div>
        <div 
          className="flex items-center gap-3 px-3 h-8 text-[13px] text-label-secondary dark:text-label-secondary rounded-md cursor-pointer select-none hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary transition-colors" 
          onClick={onTasksOpen}
        >
          <Icons.Tasks />
          Scheduled Tasks
        </div>
      </div>

      {/* 可滚动区域 */}
      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
        <div className="flex items-center justify-between px-3 py-1.5 text-[12px] font-bold text-[#8e8e93] tracking-wider uppercase select-none">
          <span>Projects</span>
          <div className="flex items-center gap-2 text-[#8e8e93]">
            <Icons.Filter />
            <div className="cursor-pointer flex items-center" onClick={onAddProject} title="导入项目文件夹">
              <Icons.FolderPlus />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-0.5 py-1">
          {projects.map((projectPath) => {
            const name = getProjectNameFromPath(projectPath);
            const isCollapsed = !!collapsedProjects[name];
            const isActive = activeWorkspacePath === projectPath;
            return (
              <div key={projectPath} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex-1 flex items-center gap-1.5 px-3 h-8 text-[13px] rounded-md cursor-pointer select-none transition-colors ${
                      isActive 
                        ? "bg-surface-secondary text-[#111] dark:text-white font-medium" 
                        : "text-label-secondary dark:text-label-secondary hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary"
                    }`}
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
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[160px]">
                      {name}
                    </span>
                  </div>
                  <button
                    className="background-none border-none text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer text-xs mr-4 flex items-center p-1 rounded-sm hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenSettingsForProject(projectPath);
                    }}
                    title="项目设置"
                  >
                    <Icons.Settings />
                  </button>
                </div>
                {!isCollapsed && renderProjectSessions(name)}
              </div>
            );
          })}

          {missingProjectNames.map((name) => {
            const isCollapsed = !!collapsedProjects[name];
            return (
              <div key={name} className="flex flex-col gap-0.5 opacity-65">
                <div className="flex items-center justify-between">
                  <div
                    className="flex-1 flex items-center gap-1.5 px-3 h-8 text-xs text-label-secondary dark:text-label-secondary rounded-md cursor-pointer select-none hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary transition-colors"
                    onClick={() => {
                      onToggleProjectCollapse(name);
                      showToast(`项目 "${name}" 未导入，请点击右上角 "+" 选择该文件夹以重新绑定。`);
                    }}
                    title="未导入/找不到物理文件夹，点击以重新关联"
                  >
                    {isCollapsed ? <Icons.Folder /> : <Icons.FolderOpen />}
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap max-w-[140px]">
                      {name} <span className="text-[12px] text-[#8e8e93]">(未导入)</span>
                    </span>
                  </div>
                </div>
                {!isCollapsed && renderProjectSessions(name)}
              </div>
            );
          })}

          {projects.length === 0 && missingProjectNames.length === 0 && (
            <div className="px-4 py-2 text-[13px] text-[#8a8a8f] text-left">
              点击右上角图标导入项目文件夹
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1 mt-3">
          <div className="px-3 py-1.5 text-[12px] font-bold text-[#8e8e93] tracking-wider uppercase select-none">Conversations</div>
          <div className="flex flex-col gap-0.5">
            {generalSessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between px-3 h-7 text-[13px] rounded-md cursor-pointer select-none transition-colors ${
                  activeSessionId === s.id 
                    ? "bg-surface-secondary text-[#111] dark:text-white font-medium" 
                    : "text-label-secondary dark:text-label-secondary hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary"
                }`}
                onClick={() => onSelectSession(s.id)}
              >
                <span className="truncate flex-1 pr-2 font-normal">
                  {s.title}
                </span>
                <span className="text-[12px] text-[#8e8e93] shrink-0">{getSessionTimeLabel(s.updatedAt)}</span>
              </div>
            ))}
            {generalSessions.length === 0 && (
              <div className="px-3 py-2 text-[13px] text-[#8a8a8f]">
                暂无普通历史会话
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-2 border-t border-border-primary shrink-0">
        <div
          className="flex items-center gap-3 px-3 h-8 text-[13px] text-label-secondary dark:text-label-secondary rounded-md cursor-pointer select-none hover:bg-surface-secondary dark:hover:bg-surface-secondary hover:text-label-primary dark:hover:text-label-primary transition-colors"
          onClick={onSettingsOpen}
        >
          <Icons.Settings />
          Settings
        </div>
      </div>
      {/* 拖拽调整宽度的把手 — 仅在侧边栏打开时显示 */}
      {isOpen && (
        <div
          className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize z-50 hover:bg-brand-blue/30 active:bg-brand-blue/50 transition-colors"
          onMouseDown={resizable.onResizeStart}
        />
      )}
    </aside>
  );
}
