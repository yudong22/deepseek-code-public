import React, { useRef, useEffect, useState } from "react";
import * as Icons from "@/components/Icons";

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
}: EmptyStateProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);

  // Auto-resize height based on text content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputText]);

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

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const appendText = inputText.length === 0 || inputText.endsWith(" ") ? "@" : " @";
    onInputChange(inputText + appendText);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

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

      <div className="chat-input-card">
        <textarea
          ref={textareaRef}
          className="chat-input-textarea"
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything, @ to mention, / for actions"
          rows={1}
        />
        
        <div className="chat-input-toolbar">
          <div className="chat-input-toolbar-left">
            <button className="chat-input-action-btn" onClick={handlePlusClick} title="Add Context">
              <Icons.Plus />
            </button>
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <button 
                className="chat-input-model-btn" 
                onClick={(e) => { e.stopPropagation(); onToggleModelDropdown(); }}
              >
                <span>{selectedModel}</span>
                <Icons.ChevronDown />
              </button>
              {isModelDropdownOpen && (
                <div className="model-dropdown bottom-aligned">
                  <div
                    className={`model-dropdown-item ${selectedModel === "deepseek-v4-flash" ? "active" : ""}`}
                    onClick={() => onSelectModel("deepseek-v4-flash")}
                  >
                    deepseek-v4-flash
                  </div>
                  <div
                    className={`model-dropdown-item ${selectedModel === "deepseek-v4-pro" ? "active" : ""}`}
                    onClick={() => onSelectModel("deepseek-v4-pro")}
                  >
                    deepseek-v4-pro
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="chat-input-toolbar-right">
            <button className="chat-input-mic-btn" title="Voice Input">
              <Icons.Mic />
            </button>
            {inputText.trim() && (
              <button className="chat-input-send-btn" onClick={onSend} title="Send">
                <Icons.ArrowRight />
              </button>
            )}
          </div>
        </div>
      </div>

      <button className="local-indicator-pill">
        <Icons.Settings />
        <span>Local</span>
        <Icons.ChevronDown />
      </button>
    </div>
  );
}
