import React, { useEffect, useState } from "react";
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
    <div className="empty-state-container">
      <div 
        className="empty-state-header" 
        onClick={(e) => {
          e.stopPropagation();
          setIsFolderDropdownOpen(!isFolderDropdownOpen);
        }}
        style={{ position: "relative", cursor: "pointer", userSelect: "none" }}
      >
        <Icons.Folder />
        <span>{currentFolderName}</span>
        <Icons.ChevronDown />

        {isFolderDropdownOpen && (
          <div 
            className="model-dropdown project-select-dropdown"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="project-dropdown-header">
              选择项目目录
            </div>
            
            {/* 默认沙箱 */}
            <div
              className={`model-dropdown-item ${!activeWorkspacePath ? "active" : ""}`}
              onClick={() => {
                onSelectProject("");
                setIsFolderDropdownOpen(false);
              }}
              style={{ fontSize: "12px", padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
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
                  className={`model-dropdown-item project-dropdown-item-border ${isActive ? "active" : ""}`}
                  onClick={() => {
                    onSelectProject(path);
                    setIsFolderDropdownOpen(false);
                  }}
                  style={{ 
                    fontSize: "12px", 
                    padding: "8px 12px", 
                    cursor: "pointer", 
                    display: "flex", 
                    alignItems: "flex-start", 
                    gap: "8px"
                  }}
                  title={path}
                >
                  <div style={{ marginTop: "2px", display: "flex", alignItems: "center" }}>
                    {isActive ? <Icons.FolderOpen /> : <Icons.Folder />}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden", textAlign: "left" }}>
                    <span style={{ fontWeight: isActive ? "600" : "normal" }}>{name}</span>
                    <span className="project-dropdown-path">
                      {path}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="project-dropdown-divider" />
            
            {/* 打开新目录 */}
            <div
              className="model-dropdown-item"
              onClick={() => {
                onAddProject();
                setIsFolderDropdownOpen(false);
              }}
              style={{ fontSize: "12px", padding: "8px 12px", cursor: "pointer", color: "#007aff", fontWeight: "500", display: "flex", alignItems: "center", gap: "8px" }}
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

      <button className="local-indicator-pill">
        <Icons.Settings />
        <span>Local</span>
        <Icons.ChevronDown />
      </button>
    </div>
  );
}
