import { useState, useMemo, useEffect, useRef } from "react";
import { bridge, Session } from "@/bridge";

interface HistoryPageProps {
  sessions: Session[];
  onNavigate: (sessionId: string) => void;
  onSessionDeleted: () => void;
  showToast: (message: string) => void;
}

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

export default function HistoryPage({
  sessions,
  onNavigate,
  onSessionDeleted,
  showToast,
}: HistoryPageProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close filter dropdown on click outside
  useEffect(() => {
    if (!isFilterDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isFilterDropdownOpen]);

  // Extract unique project names
  const uniqueProjects = useMemo(() => {
    const projects = sessions.map((s) => s.projectName || "Outside of Project");
    return Array.from(new Set(projects)).sort();
  }, [sessions]);

  // Delete session
  const handleDelete = async (e: React.MouseEvent, id: string, title: string) => {
    e.stopPropagation();
    if (!confirm(`确定删除会话「${title}」吗？此操作不可撤销。`)) return;
    try {
      await bridge.deleteSession(id);
      onSessionDeleted();
      showToast("会话已删除");
    } catch (e: any) {
      showToast(`删除失败: ${e.message}`);
    }
  };

  // Rename session
  const handleRename = async (session: Session) => {
    const newTitle = editTitle.trim();
    if (!newTitle || newTitle === session.title) {
      setEditingId(null);
      return;
    }
    try {
      await bridge.saveSession({ ...session, title: newTitle });
      onSessionDeleted();
      showToast("已重命名");
    } catch (e: any) {
      showToast(`重命名失败: ${e.message}`);
    }
    setEditingId(null);
  };

  // Filter and sort sessions
  const filtered = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    return sorted.filter((s) => {
      // 1. Search Query filter
      const q = query.trim().toLowerCase();
      const matchesQuery = q
        ? s.title.toLowerCase().includes(q) ||
          (s.projectName || "Outside of Project").toLowerCase().includes(q)
        : true;

      // 2. Project filter
      const sessionProject = s.projectName || "Outside of Project";
      const matchesProject = filterProject ? sessionProject === filterProject : true;

      return matchesQuery && matchesProject;
    });
  }, [sessions, query, filterProject]);

  return (
    <div className="history-page-container">
      <div className="history-page-content">
        <h2 className="history-page-title">Conversation History</h2>

        <div className="history-search-row">
          <div className="history-search-wrapper">
            <span className="history-search-icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..."
              className="history-search-input"
            />
          </div>

          <div style={{ position: "relative" }} ref={dropdownRef}>
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="history-filter-btn"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="21" x2="4" y2="14" />
                <line x1="4" y1="10" x2="4" y2="3" />
                <line x1="12" y1="21" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12" y2="3" />
                <line x1="20" y1="21" x2="20" y2="16" />
                <line x1="20" y1="12" x2="20" y2="3" />
                <line x1="1" y1="14" x2="7" y2="14" />
                <line x1="9" y1="8" x2="15" y2="8" />
                <line x1="17" y1="16" x2="23" y2="16" />
              </svg>
              Filter{filterProject ? `: ${filterProject}` : ""}
            </button>

            {isFilterDropdownOpen && (
              <div className="history-filter-dropdown">
                <div
                  className={`history-filter-item ${filterProject === null ? "active" : ""}`}
                  onClick={() => {
                    setFilterProject(null);
                    setIsFilterDropdownOpen(false);
                  }}
                >
                  All Projects
                  {filterProject === null && <span>✓</span>}
                </div>
                {uniqueProjects.map((p) => (
                  <div
                    key={p}
                    className={`history-filter-item ${filterProject === p ? "active" : ""}`}
                    onClick={() => {
                      setFilterProject(p);
                      setIsFilterDropdownOpen(false);
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: "8px" }}>
                      {p}
                    </span>
                    {filterProject === p && <span>✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="history-section-header">All Conversations</div>

        <div className="history-list">
          {filtered.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#8e8e93", fontSize: "14px" }}>
              {query.trim() || filterProject ? "No matching conversations" : "No conversation history"}
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className="history-item"
                onClick={() => onNavigate(s.id)}
              >
                <div className="history-item-left">
                  {editingId === s.id ? (
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(s);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleRename(s)}
                      autoFocus
                      className="history-edit-input"
                    />
                  ) : (
                    <>
                      <div className="history-item-title" title={s.title}>
                        {s.title || "(Untitled Conversation)"}
                      </div>
                      <div className="history-item-subtitle">
                        {s.projectName || "Outside of Project"}
                      </div>
                    </>
                  )}
                </div>

                <div className="history-item-right" onClick={(e) => e.stopPropagation()}>
                  {editingId !== s.id && (
                    <>
                      <span className="history-item-time">{getSessionTimeLabel(s.updatedAt)}</span>
                      <div className="history-item-actions">
                        <button
                          title="Rename"
                          onClick={() => {
                            setEditingId(s.id);
                            setEditTitle(s.title);
                          }}
                          className="history-action-btn"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <button
                          title="Delete"
                          onClick={(e) => handleDelete(e, s.id, s.title || "(Untitled)")}
                          className="history-action-btn delete"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                          </svg>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
