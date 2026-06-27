import { useState, useEffect, useMemo } from "react";
import { bridge, Session } from "@/bridge";

interface HistoryModalProps {
  isOpen: boolean;
  sessions: Session[];
  onClose: () => void;
  onNavigate: (sessionId: string) => void;
  onSessionDeleted: () => void; // 删除后刷新 App.tsx 的 sessions
  showToast: (message: string) => void;
}

/** 相对时间标签（与 LeftSidebar 一致）*/
function getTimeLabel(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSecs < 60) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 30) return `${diffDays} 天前`;
  return new Date(updatedAt).toLocaleDateString();
}

export default function HistoryModal({
  isOpen,
  sessions,
  onClose,
  onNavigate,
  onSessionDeleted,
  showToast,
}: HistoryModalProps) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

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

  // 按 updatedAt 倒序 + 搜索过滤
  const filtered = useMemo(() => {
    const sorted = [...sessions].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.projectName ?? "").toLowerCase().includes(q)
    );
  }, [sessions, query]);

  if (!isOpen) return null;

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`确定删除会话「${title}」吗？此操作不可撤销。`)) return;
    try {
      await bridge.deleteSession(id);
      onSessionDeleted();
      showToast("会话已删除");
    } catch (e: any) {
      showToast(`删除失败: ${e.message}`);
    }
  };

  const handleRename = async (session: Session) => {
    const newTitle = editTitle.trim();
    if (!newTitle || newTitle === session.title) {
      setEditingId(null);
      return;
    }
    try {
      await bridge.saveSession({ ...session, title: newTitle });
      onSessionDeleted(); // 刷新列表
      showToast("已重命名");
    } catch (e: any) {
      showToast(`重命名失败: ${e.message}`);
    }
    setEditingId(null);
  };

  const handleOpen = (id: string) => {
    onClose();
    onNavigate(id);
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div
        className="settings-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "640px", maxWidth: "90vw", maxHeight: "80vh", display: "flex", flexDirection: "column" }}
      >
        <div className="settings-modal-header">
          <h3>会话历史</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-modal-body" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {/* 搜索框 */}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话标题或项目名..."
            className="settings-input"
            style={{ marginBottom: "12px" }}
            autoFocus
          />

          <div style={{ fontSize: "12px", color: "#8e8e93", marginBottom: "8px" }}>
            共 {filtered.length} 条{query.trim() ? `（搜索: "${query.trim()}"）` : ""}
          </div>

          {/* 会话列表 */}
          <div style={{ flex: 1, overflowY: "auto", borderTop: "1px solid #e3e3e3" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "24px", textAlign: "center", color: "#8e8e93", fontSize: "13px" }}>
                {query.trim() ? "无匹配会话" : "暂无会话"}
              </div>
            ) : (
              filtered.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: "1px solid #f2f2f7",
                    gap: "8px",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => handleOpen(s.id)}>
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
                        className="settings-input"
                        style={{ padding: "2px 6px", fontSize: "13px" }}
                      />
                    ) : (
                      <>
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={s.title}
                        >
                          {s.title || "(未命名会话)"}
                        </div>
                        <div style={{ fontSize: "11px", color: "#8e8e93", marginTop: "2px" }}>
                          {s.projectName ? `${s.projectName} · ` : ""}
                          {getTimeLabel(s.updatedAt)}
                          {s.lastMessage ? ` · ${s.lastMessage.slice(0, 40)}` : ""}
                        </div>
                      </>
                    )}
                  </div>

                  {editingId !== s.id && (
                    <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                      <button
                        title="重命名"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(s.id);
                          setEditTitle(s.title);
                        }}
                        style={iconBtnStyle}
                      >
                        ✎
                      </button>
                      <button
                        title="删除"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(s.id, s.title || "(未命名)");
                        }}
                        style={{ ...iconBtnStyle, color: "#ff3b30" }}
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  fontSize: "14px",
  padding: "4px 6px",
  borderRadius: "4px",
  lineHeight: 1,
};