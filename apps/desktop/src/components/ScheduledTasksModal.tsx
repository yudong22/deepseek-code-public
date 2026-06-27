import { useState, useEffect } from "react";
import { bridge, ScheduledTask } from "@/bridge";

interface ScheduledTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string) => void;
}

function newTaskId(): string {
  return "st-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function formatSeconds(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}min`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h`;
  return `${Math.round(secs / 86400)}d`;
}

const INTERVAL_PRESETS = [
  { label: "每 10 分钟", secs: 600 },
  { label: "每小时", secs: 3600 },
  { label: "每天", secs: 86400 },
  { label: "每周", secs: 604800 },
];

export default function ScheduledTasksModal({
  isOpen,
  onClose,
  showToast,
}: ScheduledTasksModalProps) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [workspaceRoot, setWorkspaceRoot] = useState("");
  const [intervalSeconds, setIntervalSeconds] = useState(3600);

  const loadTasks = async () => {
    try {
      const list = await bridge.listScheduledTasks();
      setTasks(list);
    } catch (e: any) {
      showToast(`加载任务列表失败: ${e.message}`);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadTasks();
  }, [isOpen]);

  // Escape 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || !prompt.trim()) {
      showToast("名称和提示词不能为空");
      return;
    }
    const now = new Date().toISOString();
    const task: ScheduledTask = {
      id: newTaskId(),
      name: trimmed,
      prompt: prompt.trim(),
      workspaceRoot: workspaceRoot.trim() || ".",
      cronExpr: "",
      intervalSeconds,
      nextRunAt: new Date(Date.now() + 5000).toISOString(), // 5s 后首次执行（方便测试）
      enabled: true,
      createdAt: now,
      lastRunAt: null,
      lastStatus: null,
    };
    try {
      await bridge.createScheduledTask(task);
      showToast("任务已创建");
      setShowForm(false);
      setName("");
      setPrompt("");
      setWorkspaceRoot("");
      await loadTasks();
    } catch (e: any) {
      showToast(`创建失败: ${e.message}`);
    }
  };

  const handleToggle = async (t: ScheduledTask) => {
    try {
      await bridge.toggleScheduledTask(t.id, !t.enabled);
      await loadTasks();
    } catch (e: any) {
      showToast(`操作失败: ${e.message}`);
    }
  };

  const handleDelete = async (t: ScheduledTask) => {
    if (!confirm(`确定删除任务「${t.name}」吗？`)) return;
    try {
      await bridge.deleteScheduledTask(t.id);
      await loadTasks();
      showToast("任务已删除");
    } catch (e: any) {
      showToast(`删除失败: ${e.message}`);
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div
        className="settings-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "640px", maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
      >
        <div className="settings-modal-header">
          <h3>Scheduled Tasks</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-modal-body" style={{ flex: 1, overflow: "auto" }}>
          {/* 新建表单 */}
          {showForm ? (
            <div style={{ border: "1px solid #e3e3e3", borderRadius: "8px", padding: "12px", marginBottom: "12px" }}>
              <div className="form-group">
                <label>任务名称</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：每日代码检查" className="settings-input" />
              </div>
              <div className="form-group" style={{ marginTop: "8px" }}>
                <label>提示词（Agent 任务描述）</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="例如：检查代码质量并修复 lint 错误" className="settings-input" rows={3} style={{ resize: "vertical" }} />
              </div>
              <div className="form-group" style={{ marginTop: "8px" }}>
                <label>工作区路径</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="text" value={workspaceRoot} onChange={(e) => setWorkspaceRoot(e.target.value)} placeholder="留空用默认" className="settings-input" style={{ flex: 1 }} />
                  <button type="button" onClick={async () => { const p = await bridge.selectDirectory(); if (p) setWorkspaceRoot(p); }} style={smallBtnStyle}>浏览</button>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: "8px" }}>
                <label>执行间隔</label>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                  {INTERVAL_PRESETS.map((p) => (
                    <button key={p.secs} type="button" onClick={() => setIntervalSeconds(p.secs)} style={{ ...smallBtnStyle, background: intervalSeconds === p.secs ? "#007aff" : "#f2f2f7", color: intervalSeconds === p.secs ? "#fff" : "#1d1d1f" }}>{p.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button className="btn-primary" onClick={handleCreate}>创建任务</button>
                <button className="btn-secondary" onClick={() => setShowForm(false)}>取消</button>
              </div>
            </div>
          ) : (
            <button className="new-conv-btn" onClick={() => setShowForm(true)} style={{ marginBottom: "12px" }}>
              + 新建定时任务
            </button>
          )}

          {/* 任务列表 */}
          {tasks.length === 0 ? (
            <div style={{ padding: "24px", textAlign: "center", color: "#8e8e93", fontSize: "13px" }}>暂无定时任务，点击上方按钮创建</div>
          ) : (
            tasks.map((t) => (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", padding: "10px 12px",
                borderBottom: "1px solid #f2f2f7", gap: "8px",
                opacity: t.enabled ? 1 : 0.55,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13px", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontSize: "11px", color: "#8e8e93", marginTop: "2px" }}>
                    {t.prompt.slice(0, 60)}{t.prompt.length > 60 ? "…" : ""}
                  </div>
                  <div style={{ fontSize: "10px", color: "#aeaeb2", marginTop: "2px" }}>
                    间隔 {formatSeconds(t.intervalSeconds)} · 下次 {new Date(t.nextRunAt).toLocaleString()}
                    {t.lastStatus ? ` · 上次: ${t.lastStatus}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                  <button
                    onClick={() => handleToggle(t)}
                    style={{ ...smallBtnStyle, background: t.enabled ? "#34c759" : "#ff9500", color: "#fff" }}
                  >{t.enabled ? "启用" : "禁用"}</button>
                  <button onClick={() => handleDelete(t)} style={{ ...smallBtnStyle, color: "#ff3b30", background: "none" }}>🗑</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const smallBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  fontSize: "12px",
  border: "1px solid #d1d1d6",
  borderRadius: "6px",
  cursor: "pointer",
};