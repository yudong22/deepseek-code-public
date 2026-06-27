import { useState, useEffect, useMemo, useRef } from "react";
import { bridge, ScheduledTask } from "@/bridge";

interface TasksPageProps {
  projects: string[];
  activeWorkspacePath: string;
  showToast: (message: string) => void;
}

function newTaskId(): string {
  return "st-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function getProjectNameFromPath(path: string): string {
  if (!path) return "";
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export default function TasksPage({
  projects,
  activeWorkspacePath,
  showToast,
}: TasksPageProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [query, setQuery] = useState("");
  
  // Modal overlay state
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);
  const [taskName, setTaskName] = useState("");
  const [selectedProjectPath, setSelectedProjectPath] = useState("");
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [intervalType, setIntervalType] = useState("Daily");
  const [dailyTime, setDailyTime] = useState("9:00 AM");
  const [taskPrompt, setTaskPrompt] = useState("");

  const projectDropdownRef = useRef<HTMLDivElement>(null);

  // Load tasks on mount
  const loadTasks = async () => {
    try {
      const list = await bridge.listScheduledTasks();
      setTasks(list);
    } catch (e: any) {
      showToast(`加载任务列表失败: ${e.message}`);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  // Close project dropdown when clicking outside
  useEffect(() => {
    if (!isProjectDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(event.target as Node)) {
        setIsProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isProjectDropdownOpen]);

  // Set default project path when modal opens or projects load
  useEffect(() => {
    if (showNewTaskModal) {
      if (projects.length > 0) {
        // Default to active workspace path if it matches one of our projects, or first project
        const hasActive = projects.includes(activeWorkspacePath);
        setSelectedProjectPath(hasActive ? activeWorkspacePath : projects[0]);
      } else {
        setSelectedProjectPath(activeWorkspacePath || "");
      }
    }
  }, [showNewTaskModal, projects, activeWorkspacePath]);

  // Handle toggle task status
  const handleToggle = async (t: ScheduledTask) => {
    try {
      await bridge.toggleScheduledTask(t.id, !t.enabled);
      await loadTasks();
      showToast(t.enabled ? "任务已禁用" : "任务已启用");
    } catch (e: any) {
      showToast(`操作失败: ${e.message}`);
    }
  };

  // Handle delete task
  const handleDelete = async (e: React.MouseEvent, t: ScheduledTask) => {
    e.stopPropagation();
    if (!confirm(`确定删除任务「${t.name}」吗？`)) return;
    try {
      await bridge.deleteScheduledTask(t.id);
      await loadTasks();
      showToast("任务已删除");
    } catch (e: any) {
      showToast(`删除失败: ${e.message}`);
    }
  };

  // Calculate next run date for the task based on schedule
  const calculateNextRunAt = (type: string, timeStr: string): Date => {
    const now = new Date();
    if (type === "Daily") {
      const [time, modifier] = timeStr.split(" ");
      let [hoursStr, minutesStr] = time.split(":");
      let hours = parseInt(hoursStr, 10);
      const minutes = parseInt(minutesStr, 10) || 0;

      if (modifier === "PM" && hours < 12) {
        hours += 12;
      }
      if (modifier === "AM" && hours === 12) {
        hours = 0;
      }

      const target = new Date();
      target.setHours(hours, minutes, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target;
    }

    if (type === "Hourly") {
      const target = new Date();
      target.setHours(target.getHours() + 1, 0, 0, 0);
      return target;
    }

    // Weekly - default to next week same time
    const target = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return target;
  };

  // Handle submit task creation
  const handleSubmitTask = async () => {
    const trimmedName = taskName.trim();
    const trimmedPrompt = taskPrompt.trim();

    if (!trimmedName || !trimmedPrompt) {
      showToast("名称和提示词不能为空");
      return;
    }

    let seconds = 86400; // Daily
    if (intervalType === "Hourly") seconds = 3600;
    if (intervalType === "Weekly") seconds = 604800;

    const nextRun = calculateNextRunAt(intervalType, dailyTime);
    const now = new Date().toISOString();

    const task: ScheduledTask = {
      id: newTaskId(),
      name: trimmedName,
      prompt: trimmedPrompt,
      workspaceRoot: selectedProjectPath || activeWorkspacePath || ".",
      cronExpr: "",
      intervalSeconds: seconds,
      nextRunAt: nextRun.toISOString(),
      enabled: true,
      createdAt: now,
      lastRunAt: null,
      lastStatus: null,
    };

    try {
      await bridge.createScheduledTask(task);
      showToast("定时任务已创建");
      setShowNewTaskModal(false);
      setTaskName("");
      setTaskPrompt("");
      setIntervalType("Daily");
      setDailyTime("9:00 AM");
      await loadTasks();
    } catch (e: any) {
      showToast(`创建失败: ${e.message}`);
    }
  };

  // Filter tasks based on query
  const filteredTasks = useMemo(() => {
    if (!query.trim()) return tasks;
    const q = query.trim().toLowerCase();
    return tasks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.prompt.toLowerCase().includes(q) ||
        getProjectNameFromPath(t.workspaceRoot).toLowerCase().includes(q)
    );
  }, [tasks, query]);

  return (
    <div className="history-page-container">
      <div className="history-page-content">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
          <h2 className="history-page-title" style={{ margin: 0 }}>Scheduled Tasks</h2>
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="tasks-new-btn"
          >
            <span style={{ fontSize: "14px", fontWeight: "bold" }}>+</span> New
          </button>
        </div>

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
              placeholder="Search tasks..."
              className="history-search-input"
            />
          </div>
        </div>

        <div className="history-section-header">All Tasks</div>

        <div className="history-list">
          {filteredTasks.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#8e8e93", fontSize: "14px" }}>
              {query.trim() ? "No matching scheduled tasks" : "No scheduled tasks"}
            </div>
          ) : (
            filteredTasks.map((t) => {
              const projName = getProjectNameFromPath(t.workspaceRoot) || "Outside of Project";
              const cronDesc = t.intervalSeconds === 3600
                ? "Hourly"
                : t.intervalSeconds === 604800
                ? "Weekly"
                : `Daily`;
                
              return (
                <div
                  key={t.id}
                  className={`history-item ${!t.enabled ? "disabled-task" : ""}`}
                  style={{ opacity: t.enabled ? 1 : 0.6 }}
                >
                  <div className="history-item-left">
                    <div className="history-item-title" title={t.name}>
                      {t.name}
                    </div>
                    <div className="history-item-subtitle">
                      {projName} · {cronDesc} · {t.prompt.length > 50 ? `${t.prompt.slice(0, 50)}...` : t.prompt}
                    </div>
                  </div>

                  <div className="history-item-right" onClick={(e) => e.stopPropagation()}>
                    <span className="history-item-time" style={{ fontSize: "11px" }}>
                      Next: {new Date(t.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="history-item-actions">
                      <button
                        title={t.enabled ? "Disable Task" : "Enable Task"}
                        onClick={() => handleToggle(t)}
                        className={`history-action-btn ${t.enabled ? "enabled-state" : "disabled-state"}`}
                        style={{ color: t.enabled ? "#34c759" : "#ff9500" }}
                      >
                        {t.enabled ? (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                          </svg>
                        ) : (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                      <button
                        title="Delete"
                        onClick={(e) => handleDelete(e, t)}
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
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* New Scheduled Task Modal Overlay */}
      {showNewTaskModal && (
        <div className="new-task-overlay" onClick={() => setShowNewTaskModal(false)}>
          <div className="new-task-card" onClick={(e) => e.stopPropagation()}>
            <div className="new-task-header">
              <h3 className="new-task-title">New Scheduled Task</h3>
              <button className="new-task-close-btn" onClick={() => setShowNewTaskModal(false)}>✕</button>
            </div>

            <div className="new-task-body">
              <div className="new-task-form-group">
                <label className="new-task-label">Name</label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="Enter scheduled task name..."
                  className="new-task-input"
                  autoFocus
                />
              </div>

              <div className="new-task-form-group" ref={projectDropdownRef}>
                <label className="new-task-label">Project</label>
                <div className="new-task-select-wrapper" onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}>
                  <div className="new-task-select-display">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="new-task-folder-icon">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="new-task-project-name">
                      {getProjectNameFromPath(selectedProjectPath) || "Outside of Project"}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="new-task-chevron">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {isProjectDropdownOpen && (
                    <div className="new-task-dropdown">
                      {projects.map((projPath) => (
                        <div
                          key={projPath}
                          className={`new-task-dropdown-item ${selectedProjectPath === projPath ? "active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProjectPath(projPath);
                            setIsProjectDropdownOpen(false);
                          }}
                        >
                          {getProjectNameFromPath(projPath)}
                        </div>
                      ))}
                      <div
                        className={`new-task-dropdown-item ${selectedProjectPath === "" ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProjectPath("");
                          setIsProjectDropdownOpen(false);
                        }}
                      >
                        Outside of Project
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="new-task-form-group">
                <label className="new-task-label">Schedule</label>
                <div className="new-task-schedule-row">
                  <select
                    value={intervalType}
                    onChange={(e) => setIntervalType(e.target.value)}
                    className="new-task-select-compact"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Weekly">Weekly</option>
                  </select>

                  {intervalType === "Daily" && (
                    <>
                      <span className="new-task-schedule-text">around</span>
                      <select
                        value={dailyTime}
                        onChange={(e) => setDailyTime(e.target.value)}
                        className="new-task-select-compact"
                      >
                        <option value="9:00 AM">9:00 AM</option>
                        <option value="10:00 AM">10:00 AM</option>
                        <option value="11:00 AM">11:00 AM</option>
                        <option value="12:00 PM">12:00 PM</option>
                        <option value="1:00 PM">1:00 PM</option>
                        <option value="2:00 PM">2:00 PM</option>
                        <option value="3:00 PM">3:00 PM</option>
                        <option value="4:00 PM">4:00 PM</option>
                        <option value="5:00 PM">5:00 PM</option>
                        <option value="6:00 PM">6:00 PM</option>
                        <option value="7:00 PM">7:00 PM</option>
                        <option value="8:00 PM">8:00 PM</option>
                        <option value="9:00 PM">9:00 PM</option>
                        <option value="10:00 PM">10:00 PM</option>
                        <option value="11:00 PM">11:00 PM</option>
                        <option value="12:00 AM">12:00 AM</option>
                        <option value="1:00 AM">1:00 AM</option>
                        <option value="2:00 AM">2:00 AM</option>
                        <option value="3:00 AM">3:00 AM</option>
                        <option value="4:00 AM">4:00 AM</option>
                        <option value="5:00 AM">5:00 AM</option>
                        <option value="6:00 AM">6:00 AM</option>
                        <option value="7:00 AM">7:00 AM</option>
                        <option value="8:00 AM">8:00 AM</option>
                      </select>
                    </>
                  )}
                </div>
              </div>

              <div className="new-task-form-group">
                <label className="new-task-label">Prompt</label>
                <textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Enter a prompt for the agent to run..."
                  className="new-task-textarea"
                />
                <div className="new-task-caption">All scheduled tasks run as Flash.</div>
              </div>
            </div>

            <div className="new-task-footer">
              <button className="new-task-submit-btn" onClick={handleSubmitTask}>
                Add Scheduled Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
