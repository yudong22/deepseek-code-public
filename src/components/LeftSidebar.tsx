import { Session } from "@/bridge";
import * as Icons from "@/components/Icons";

interface LeftSidebarProps {
  isOpen: boolean;
  sessions: Session[];
  activeSessionId: string | undefined;
  onNewConversation: () => void;
  onSelectSession: (id: string) => void;
  onSettingsOpen: () => void;
  showToast: (message: string) => void;
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

export default function LeftSidebar({
  isOpen,
  sessions,
  activeSessionId,
  onNewConversation,
  onSelectSession,
  onSettingsOpen,
  showToast,
}: LeftSidebarProps) {
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
        <div className="nav-item" onClick={() => showToast("待开发")}>
          <Icons.History />
          Conversation History
        </div>
        <div className="nav-item" onClick={() => showToast("待开发")}>
          <Icons.Tasks />
          Scheduled Tasks
        </div>
      </div>

      {/* 可滚动区域 */}
      <div className="sidebar-scroll">
        <div className="section-title" onClick={() => showToast("暂未开通")}>
          <span>Projects</span>
          <div className="section-title-tools">
            <Icons.Filter />
            <Icons.FolderPlus />
          </div>
        </div>

        <div style={{ padding: "4px 8px" }}>
          {/* 发布前清空项目文件夹列表 */}
        </div>

        {/* 会话列表 */}
        <div className="conversations-section">
          <div className="conversations-title">Conversations</div>
          <div className="conversations-list">
            {sessions.map((s) => (
              <div
                key={s.id}
                className={`session-link ${activeSessionId === s.id ? "active" : ""}`}
                onClick={() => onSelectSession(s.id)}
              >
                <span className="session-title-text" style={{ fontWeight: activeSessionId === s.id ? "500" : "normal" }}>
                  {s.title}
                </span>
                <span className="session-time">{getSessionTimeLabel(s.updatedAt)}</span>
              </div>
            ))}
            {sessions.length === 0 && (
              <div style={{ padding: "8px 12px", fontSize: "11px", color: "#8a8a8f" }}>
                暂无历史会话
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部设置入口 */}
      <div className="sidebar-footer">
        <div className="nav-item" onClick={onSettingsOpen}>
          <Icons.Settings />
          Settings
        </div>
      </div>
    </aside>
  );
}
