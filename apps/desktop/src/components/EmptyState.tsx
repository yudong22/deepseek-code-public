import { useEffect, useState } from "react";
import * as Icons from "@/components/Icons";
import ChatInputCard from "@/components/ChatInputCard";

interface EmptyStateProps {
  inputText: string;
  selectedModel: string;
  isModelDropdownOpen: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleModelDropdown: () => void;
  onSelectModel: (model: string) => void;
  activeWorkspacePath: string;
  projects: string[];
  onSelectProject: (projectPath: string) => void;
  onAddProject: () => void;
  /** 列出工作区文件 */
  onListFiles?: () => Promise<string[]>;
  /** 在右侧面板预览文件 */
  onPreviewFile?: (relativePath: string) => void;
}

export default function EmptyState({
  inputText,
  selectedModel,
  isModelDropdownOpen,
  onInputChange,
  onSend,
  onToggleModelDropdown,
  onSelectModel,
  activeWorkspacePath,
  projects,
  onSelectProject,
  onAddProject,
  onListFiles,
  onPreviewFile,
}: EmptyStateProps) {
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);

  // Click outside folder dropdown to close it
  useEffect(() => {
    if (!isFolderDropdownOpen) return;
    const handleClose = () => {
      setIsFolderDropdownOpen(false);
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClose);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClose);
    };
  }, [isFolderDropdownOpen]);

  const currentFolderName = activeWorkspacePath
    ? activeWorkspacePath.split(/[/\\]/).pop() || activeWorkspacePath
    : "sandbox_workspace";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto w-full gap-5 relative bg-white dark:bg-[#1c1c1e]">
      <div 
        className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#efeff4] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] rounded-full text-xs font-semibold text-zinc-600 dark:text-zinc-400 transition-colors cursor-pointer select-none border-0 relative" 
        onClick={(e) => {
          e.stopPropagation();
          setIsFolderDropdownOpen(!isFolderDropdownOpen);
        }}
      >
        <Icons.Folder />
        <span>{currentFolderName}</span>
        <Icons.ChevronDown />

        {isFolderDropdownOpen && (
          <div 
            className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-white dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg z-50 py-1 w-64 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-2 text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase border-b border-[#e3e3e3] dark:border-[#2c2c2e] mb-1 select-none text-left">
              选择项目目录
            </div>
            
            {/* 默认沙箱 */}
            <div
              className={`px-3 py-2 text-xs cursor-pointer flex items-center gap-2 transition-colors ${
                !activeWorkspacePath ? "text-brand-blue font-semibold" : "text-zinc-700 dark:text-zinc-300 hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c]"
              }`}
              onClick={() => {
                onSelectProject("");
                setIsFolderDropdownOpen(false);
              }}
            >
              <Icons.Folder />
              <span>sandbox_workspace</span>
            </div>

            {/* 已有导入的项目 */}
            {projects.map((path) => {
              const name = path.split(/[/\\]/).pop() || path;
              const isActive = activeWorkspacePath === path;
              return (
                <div
                  key={path}
                  className={`px-3 py-2 text-xs cursor-pointer flex items-start gap-2 border-b border-zinc-150/50 dark:border-zinc-850/50 transition-colors ${
                    isActive ? "text-brand-blue font-semibold" : "text-zinc-700 dark:text-zinc-300 hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c]"
                  }`}
                  onClick={() => {
                    onSelectProject(path);
                    setIsFolderDropdownOpen(false);
                  }}
                  title={path}
                >
                  <div className="mt-0.5 flex items-center">
                    {isActive ? <Icons.FolderOpen /> : <Icons.Folder />}
                  </div>
                  <div className="flex flex-col gap-0.5 overflow-hidden text-left">
                    <span>{name}</span>
                    <span className="text-[9px] text-[#8e8e93] font-mono truncate max-w-[200px]">
                      {path}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="h-[1px] bg-[#e3e3e3] dark:bg-[#2c2c2e] my-1" />
            
            {/* 打开新目录 */}
            <div
              className="px-3 py-2 text-xs cursor-pointer text-brand-blue dark:text-deepseek-400 font-semibold flex items-center gap-2 hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c] transition-colors"
              onClick={() => {
                onAddProject();
                setIsFolderDropdownOpen(false);
              }}
            >
              <Icons.FolderPlus />
              <span>打开新目录...</span>
            </div>
          </div>
        )}
      </div>

      <ChatInputCard
        inputText={inputText}
        selectedModel={selectedModel}
        isModelDropdownOpen={isModelDropdownOpen}
        onInputChange={onInputChange}
        onSend={onSend}
        onToggleModelDropdown={onToggleModelDropdown}
        onSelectModel={onSelectModel}
        workspacePath={activeWorkspacePath}
        onListFiles={onListFiles}
        onPreviewFile={onPreviewFile}
      />

      <button className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-[#efeff4] dark:bg-[#2c2c2e] rounded-full text-xs font-semibold text-zinc-500 dark:text-zinc-400 border-0 cursor-default select-none">
        <Icons.Settings />
        <span>Local</span>
        <Icons.ChevronDown />
      </button>
    </div>
  );
}
