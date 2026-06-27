import { useEffect } from "react";
import { bridge } from "@/bridge";

interface ProjectSettingsModalProps {
  isOpen: boolean;
  /** 项目完整路径 */
  projectPath: string;
  /** 项目名称（路径最后一段） */
  projectName: string;
  /** 工作区目录 */
  workspacePath: string;
  /** 该项目的会话数 */
  sessionCount: number;
  onClose: () => void;
  onWorkspaceChange: (value: string) => void;
  onDeleteProject: (projectPath: string) => void;
}

export default function ProjectSettingsModal({
  isOpen,
  projectPath,
  projectName,
  workspacePath,
  sessionCount,
  onClose,
  onWorkspaceChange,
  onDeleteProject,
}: ProjectSettingsModalProps) {

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

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[1100]" onClick={onClose}>
      <div className="bg-white dark:bg-[#1c1c1e] w-[460px] rounded-xl shadow-xl flex flex-col border border-zinc-200 dark:border-zinc-800 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-between items-center shrink-0">
          <h3 className="text-sm font-semibold text-zinc-800 dark:text-[#f5f5f7] m-0">项目设置</h3>
          <button className="text-lg text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 bg-transparent border-0 cursor-pointer" onClick={onClose}>×</button>
        </div>
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {/* 项目名称 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">项目</label>
            <div className="flex items-center gap-2 h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] rounded-md text-xs text-zinc-800 dark:text-[#f5f5f7]">
              <span className="font-medium">{projectName}</span>
            </div>
          </div>

          {/* 工作区目录 */}
          <div className="flex flex-col gap-1.5 mt-4">
            <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">工作区目录（Workspace）</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={workspacePath}
                onChange={(e) => onWorkspaceChange(e.target.value)}
                placeholder="留空则使用默认沙箱目录"
                className="w-full h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors flex-1"
              />
              <button
                type="button"
                onClick={async () => {
                  const path = await bridge.selectDirectory();
                  if (path) {
                    onWorkspaceChange(path);
                  }
                }}
                className="h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors flex items-center justify-center"
              >
                浏览...
              </button>
            </div>
            <p className="text-[10px] leading-normal mt-1 text-[#8e8e93]">
              {workspacePath.trim() ? (
                <span>AI 将在此目录内读写文件：<code className="text-[11px] bg-[#f2f2f7] dark:bg-[#2c2c2e] px-1 py-0.5 rounded-sm">{workspacePath}</code></span>
              ) : (
                <span>留空时使用 App 数据目录下的 <code className="text-[11px] bg-[#f2f2f7] dark:bg-[#2c2c2e] px-1 py-0.5 rounded-sm">sandbox_workspace/</code> 作为沙箱</span>
              )}
            </p>
          </div>

          {/* 删除项目 */}
          <div className="flex flex-col gap-2 mt-4 border-t border-[#e3e3e3] dark:border-[#2c2c2e] pt-4">
            <label className="text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">删除项目</label>
            <div className="flex flex-col gap-2.5 p-3 bg-red-50/50 dark:bg-red-900/10 border border-red-200/60 dark:border-red-800/30 rounded-lg">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">{projectName}</span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  删除后将同时移除该项目的 {sessionCount} 个会话记录，此操作不可撤销
                </span>
              </div>
              <button
                type="button"
                onClick={() => onDeleteProject(projectPath)}
                className="h-7.5 px-3 bg-red-500 hover:bg-red-600 text-white border-0 rounded-md text-xs font-semibold cursor-pointer transition-colors self-start"
              >
                删除项目
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[#e3e3e3] dark:border-[#2c2c2e] flex justify-end gap-2 shrink-0">
          <button
            className="h-8.5 px-4 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border border-zinc-200 dark:border-zinc-800 rounded-md text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer transition-colors flex items-center justify-center"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
