import { useState, useEffect, useMemo } from "react";
import { bridge, Session } from "@/bridge";
import ConfirmDialog from "./ConfirmDialog";

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
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);

  // Escape 关闭
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (deleteTarget) {
          setDeleteTarget(null);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose, deleteTarget]);

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

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const title = deleteTarget.title;
    setDeleteTarget(null);
    try {
      await bridge.deleteSession(id);
      onSessionDeleted();
      showToast(`已删除「${title}」`);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : (e?.message || String(e));
      showToast(`删除失败: ${msg}`);
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
      const msg = typeof e === "string" ? e : (e?.message || String(e));
      showToast(`重命名失败: ${msg}`);
    }
    setEditingId(null);
  };

  const handleOpen = (id: string) => {
    onClose();
    onNavigate(id);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1100]" onClick={onClose}>
        <div
          className="bg-white dark:bg-[#1c1c1e] w-[640px] max-w-[90vw] rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="px-5 py-4 border-b border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-between items-center shrink-0">
            <h3 className="text-sm font-semibold text-zinc-800 dark:text-[#f5f5f7] m-0">会话历史</h3>
            <button className="text-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 bg-transparent border-0 cursor-pointer" onClick={onClose}>×</button>
          </div>

          {/* 主体 */}
          <div className="p-5 flex flex-col gap-3 overflow-y-auto flex-1">
            {/* 搜索框 */}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索会话标题或项目名..."
              className="w-full h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors"
              autoFocus
            />

            <div className="text-[10px] text-[#8e8e93]">
              共 {filtered.length} 条{sessions.length !== filtered.length ? `（搜索: "${query.trim()}"）` : ""}
            </div>

            {/* 会话列表 */}
            <div className="flex flex-col border-t border-[#e3e3e3] dark:border-[#2c2c2e] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
                  {query.trim() ? "无匹配会话" : "暂无会话"}
                </div>
              ) : (
                filtered.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center px-3 py-2.5 border-b border-[#f2f2f7] dark:border-[#2c2c2e] gap-2 hover:bg-[#f2f2f7] dark:hover:bg-[#2c2c2e] transition-colors"
                  >
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleOpen(s.id)}>
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
                          className="w-full h-7 px-2 bg-white dark:bg-[#3a3a3c] border border-zinc-200 dark:border-zinc-700 rounded text-xs outline-none text-zinc-800 dark:text-[#f5f5f7]"
                        />
                      ) : (
                        <>
                          <div
                            className="text-xs font-medium text-zinc-800 dark:text-[#f5f5f7] overflow-hidden text-ellipsis whitespace-nowrap"
                            title={s.title}
                          >
                            {s.title || "(未命名会话)"}
                          </div>
                          <div className="text-[10px] text-[#8e8e93] mt-0.5">
                            {s.projectName ? `${s.projectName} · ` : ""}
                            {getTimeLabel(s.updatedAt)}
                            {s.lastMessage ? ` · ${s.lastMessage.slice(0, 40)}` : ""}
                          </div>
                        </>
                      )}
                    </div>

                    {editingId !== s.id && (
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          title="重命名"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingId(s.id);
                            setEditTitle(s.title);
                          }}
                          className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 bg-transparent border-0 cursor-pointer rounded-sm hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] transition-colors text-xs"
                        >
                          ✎
                        </button>
                        <button
                          title="删除"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(s);
                          }}
                          className="p-1 text-zinc-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 bg-transparent border-0 cursor-pointer rounded-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 底部 */}
          <div className="px-5 py-3 border-t border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-end shrink-0">
            <button
              className="h-8 px-4 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </div>
      </div>

      {/* 删除确认弹框 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除会话"
        message={`确定要删除会话「${deleteTarget?.title || ""}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
