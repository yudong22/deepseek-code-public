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
    <div className="flex-1 bg-white dark:bg-surface-primary overflow-y-auto w-full">
      <div className="max-w-[740px] mx-auto px-6 py-8 flex flex-col gap-6">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight m-0">Conversation History</h2>

        {/* Search + Filter */}
        <div className="flex items-center gap-3 w-full">
          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3.5 flex items-center pointer-events-none">
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
              className="w-full h-8 pl-10 pr-4 bg-surface-secondary hover:bg-surface-hover border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-label-primary placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors"
            />
          </div>

          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className={`h-8 px-4 border-0 rounded-md text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors ${
                filterProject
                  ? "bg-surface-secondary text-brand-blue dark:text-deepseek-400"
                  : "bg-surface-secondary hover:bg-surface-hover text-[#333] dark:text-[#d0d0d0]"
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-surface-secondary border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg z-50 py-1 w-52 flex flex-col overflow-hidden">
                <div
                  className={`px-3.5 py-2 text-[13px] cursor-pointer flex items-center justify-between transition-colors ${
                    filterProject === null ? "text-brand-blue font-medium" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 hover:bg-surface-hover"
                  }`}
                  onClick={() => { setFilterProject(null); setIsFilterDropdownOpen(false); }}
                >
                  All Projects
                  {filterProject === null && <span className="text-brand-blue">✓</span>}
                </div>
                {uniqueProjects.map((p) => (
                  <div
                    key={p}
                    className={`px-3.5 py-2 text-[13px] cursor-pointer flex items-center justify-between transition-colors ${
                      filterProject === p ? "text-brand-blue font-medium" : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 hover:bg-surface-hover"
                    }`}
                    onClick={() => { setFilterProject(p); setIsFilterDropdownOpen(false); }}
                  >
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap mr-2">{p}</span>
                    {filterProject === p && <span className="text-brand-blue">✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Section header */}
        <div className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase border-b border-border-primary pb-1 select-none">
          All Conversations
        </div>

        {/* List */}
        <div className="flex flex-col">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-zinc-550 dark:text-zinc-400 text-sm">
              {query.trim() || filterProject ? "No matching conversations" : "No conversation history"}
            </div>
          ) : (
            filtered.map((s) => (
              <div
                key={s.id}
                className="group flex items-center justify-between py-3.5 border-b border-zinc-100 dark:border-zinc-800/70 hover:bg-zinc-50 dark:hover:bg-surface-secondary/60 cursor-pointer select-none transition-colors rounded-sm -mx-2 px-2"
                onClick={() => onNavigate(s.id)}
              >
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
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
                      className="h-7 px-2 bg-surface-secondary border border-brand-blue dark:border-deepseek-400 rounded-md text-[13px] text-zinc-800 dark:text-label-primary outline-none w-full max-w-[400px]"
                    />
                  ) : (
                    <>
                      <div className="text-xs font-semibold text-zinc-800 dark:text-label-primary truncate" title={s.title}>
                        {s.title || "(Untitled Conversation)"}
                      </div>
                      <div className="text-[10px] text-zinc-400 dark:text-zinc-550">
                        {s.projectName || "Outside of Project"}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-6" onClick={(e) => e.stopPropagation()}>
                  {editingId !== s.id && (
                    <>
                      <span className="text-[10px] text-[#8e8e93] group-hover:hidden">
                        {getSessionTimeLabel(s.updatedAt)}
                      </span>
                      <div className="hidden group-hover:flex items-center gap-0.5">
                        <button
                          title="Rename"
                          onClick={() => { setEditingId(s.id); setEditTitle(s.title); }}
                          className="bg-surface-secondary hover:bg-surface-hover border-0 cursor-pointer text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1 rounded-md transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        </button>
                        <button
                          title="Delete"
                          onClick={(e) => handleDelete(e, s.id, s.title || "(Untitled)")}
                          className="bg-surface-secondary hover:bg-surface-hover border-0 cursor-pointer text-zinc-400 hover:text-red-500 p-1 rounded-md transition-colors"
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
