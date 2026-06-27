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
    <div className="flex-1 bg-white dark:bg-[#1c1c1e] overflow-y-auto w-full">
      <div className="max-w-[740px] mx-auto px-6 py-8 flex flex-col gap-6">
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight m-0">Scheduled Tasks</h2>
          <button
            onClick={() => setShowNewTaskModal(true)}
            className="px-3 h-8 bg-brand-blue hover:bg-brand-blue-hover text-white rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer transition-colors border-0"
          >
            <span className="text-sm font-bold">+</span> New
          </button>
        </div>

        <div className="flex items-center gap-3 w-full">
          <div className="relative flex-1 flex items-center">
            <span className="absolute left-3.5 flex items-center">
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
              className="w-full h-8 pl-10 pr-4 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors"
            />
          </div>
        </div>

        <div className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase border-b border-[#e3e3e3] dark:border-[#2c2c2e] pb-1 select-none">All Tasks</div>

        <div className="flex flex-col gap-0.5">
          {filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-zinc-550 dark:text-zinc-400 text-sm">
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
                  className={`group flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-white dark:bg-[#1c1c1e] border border-zinc-100 dark:border-zinc-900/50 hover:bg-[#efeff4] dark:hover:bg-[#2c2c2e] hover:border-zinc-200 dark:hover:border-zinc-800 transition-all duration-200 ${
                    !t.enabled ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <div className="text-xs font-semibold text-zinc-800 dark:text-[#f5f5f7] truncate max-w-[600px]" title={t.name}>
                      {t.name}
                    </div>
                    <div className="text-[10px] text-zinc-400 dark:text-zinc-550">
                      {projName} · {cronDesc} · {t.prompt.length > 50 ? `${t.prompt.slice(0, 50)}...` : t.prompt}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] text-[#8e8e93] group-hover:hidden">
                      Next: {new Date(t.nextRunAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <div className="hidden group-hover:flex items-center gap-1">
                      <button
                        title={t.enabled ? "Disable Task" : "Enable Task"}
                        onClick={() => handleToggle(t)}
                        className="bg-transparent border-0 cursor-pointer p-1 rounded-md transition-colors flex items-center justify-center"
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
                        className="bg-transparent border-0 cursor-pointer text-[#8e8e93] hover:text-red-500 p-1 rounded-md transition-colors flex items-center justify-center"
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
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1100]" onClick={() => setShowNewTaskModal(false)}>
          <div className="bg-white dark:bg-[#1c1c1e] w-[460px] rounded-xl shadow-xl flex flex-col border border-zinc-200 dark:border-zinc-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-between items-center shrink-0">
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-[#f5f5f7] m-0">New Scheduled Task</h3>
              <button className="text-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 bg-transparent border-0 cursor-pointer" onClick={() => setShowNewTaskModal(false)}>✕</button>
            </div>

            <div className="p-5 flex flex-col gap-4 overflow-y-auto">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">Name</label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder="Enter scheduled task name..."
                  className="w-full h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5" ref={projectDropdownRef}>
                <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">Project</label>
                <div className="relative" onClick={() => setIsProjectDropdownOpen(!isProjectDropdownOpen)}>
                  <div className="w-full h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs flex items-center cursor-pointer transition-colors text-zinc-800 dark:text-[#f5f5f7]">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#8e8e93] mr-2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="flex-1 truncate">
                      {getProjectNameFromPath(selectedProjectPath) || "Outside of Project"}
                    </span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-[#8e8e93] ml-2">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>

                  {isProjectDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg z-50 py-1 flex flex-col overflow-hidden">
                      {projects.map((projPath) => (
                        <div
                          key={projPath}
                          className={`px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                            selectedProjectPath === projPath 
                              ? "text-brand-blue font-medium" 
                              : "text-zinc-700 dark:text-zinc-300 hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c]"
                          }`}
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
                        className={`px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                          selectedProjectPath === "" 
                            ? "text-brand-blue font-medium" 
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c]"
                        }`}
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

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">Schedule</label>
                <div className="flex items-center gap-2">
                  <select
                    value={intervalType}
                    onChange={(e) => setIntervalType(e.target.value)}
                    className="h-8 px-2 bg-[#f2f2f7] dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs text-zinc-800 dark:text-[#f5f5f7] outline-none cursor-pointer"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Hourly">Hourly</option>
                    <option value="Weekly">Weekly</option>
                  </select>

                  {intervalType === "Daily" && (
                    <>
                      <span className="text-xs text-[#8e8e93]">around</span>
                      <select
                        value={dailyTime}
                        onChange={(e) => setDailyTime(e.target.value)}
                        className="h-8 px-2 bg-[#f2f2f7] dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs text-zinc-800 dark:text-[#f5f5f7] outline-none cursor-pointer"
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

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">Prompt</label>
                <textarea
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  placeholder="Enter a prompt for the agent to run..."
                  className="w-full h-24 p-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-600 resize-none transition-colors"
                />
                <div className="text-[10px] text-[#8e8e93] mt-1">All scheduled tasks run as Flash.</div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-end shrink-0">
              <button 
                className="h-8.5 px-4 bg-brand-blue hover:bg-brand-blue-hover text-white border-0 rounded-md text-xs font-semibold cursor-pointer transition-colors" 
                onClick={handleSubmitTask}
              >
                Add Scheduled Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
