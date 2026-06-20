import React, { useRef, useEffect, useState, useCallback } from "react";
import * as Icons from "@/components/Icons";
import FileAutocomplete from "@/components/FileAutocomplete";
import SlashAutocomplete, { filterSlashCommands } from "@/components/SlashAutocomplete";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);

  // --- @ 文件自动补全状态 ---
  const [allWorkspaceFiles, setAllWorkspaceFiles] = useState<string[]>([]);
  const [filesForAutocomplete, setFilesForAutocomplete] = useState<string[]>([]);
  const [showFileAutocomplete, setShowFileAutocomplete] = useState(false);
  const [fileAutocompleteSelected, setFileAutocompleteSelected] = useState(0);

  // 加载工作区文件列表
  useEffect(() => {
    if (onListFiles) {
      onListFiles().then((files) => setAllWorkspaceFiles(files));
    }
  }, [activeWorkspacePath]);

  // --- / Slash 命令自动补全 ---
  const [slashCommands, setSlashCommands] = useState<{ name: string; aliases: string[]; description: string; icon: string }[]>([]);
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // 检测 / 触发（只有输入以 / 开头时才激活）
  useEffect(() => {
    if (inputText.startsWith("/")) {
      const query = inputText.slice(1).toLowerCase();
      setSlashQuery(query);
      const filtered = filterSlashCommands(query);
      setSlashCommands(filtered);
      setSlashSelectedIndex(0);
      setShowSlashAutocomplete(filtered.length > 0);
    } else {
      setShowSlashAutocomplete(false);
    }
  }, [inputText]);

  // 选中 slash 命令
  const selectSlashCommand = useCallback(
    (cmd: { name: string; aliases: string[]; description: string; icon: string }) => {
      onInputChange("/" + cmd.name + " ");
      setShowSlashAutocomplete(false);
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    [onInputChange]
  );

  // 检测 @ 触发并过滤文件
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPos = textarea.selectionStart;
    const textBeforeCursor = inputText.slice(0, cursorPos);

    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    const charBefore = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : " ";
    const isValidTrigger =
      lastAtIndex >= 0 &&
      (charBefore === " " || lastAtIndex === 0);

    if (isValidTrigger) {
      const query = textBeforeCursor.slice(lastAtIndex + 1).toLowerCase();
      const filtered = allWorkspaceFiles.filter((f) =>
        f.toLowerCase().includes(query)
      );
      setFilesForAutocomplete(filtered.slice(0, 20));
      setFileAutocompleteSelected(0);
      setShowFileAutocomplete(filtered.length > 0);
    } else {
      setShowFileAutocomplete(false);
    }
  }, [inputText, allWorkspaceFiles]);

  // 选中自动补全文件
  const selectAutocompleteFile = useCallback(
    (filePath: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textBeforeCursor = inputText.slice(0, cursorPos);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      const newText =
        inputText.slice(0, lastAtIndex) +
        "@" +
        filePath +
        " " +
        inputText.slice(cursorPos);

      onInputChange(newText);
      setShowFileAutocomplete(false);

      if (onPreviewFile) {
        onPreviewFile(filePath);
      }

      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = lastAtIndex + filePath.length + 2;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [inputText, onInputChange, onPreviewFile]
  );

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

  // 点击 textarea 中的 @文件名 → 预览文件
  const handleTextareaClick = useCallback(() => {
    setTimeout(() => {
      const textarea = textareaRef.current;
      if (!textarea || !onPreviewFile) return;

      const pos = textarea.selectionStart;
      const text = textarea.value;

      // 找到光标位置之前的 @
      const atIdx = text.lastIndexOf("@", pos);
      if (atIdx === -1) return;

      // @ 必须是词边界（开头或前面是空白）
      if (atIdx > 0 && text[atIdx - 1] !== " ") return;

      // 从 @ 位置往后扫到词尾（空白或结束）
      let wordEnd = atIdx + 1;
      while (wordEnd < text.length && text[wordEnd] !== " " && text[wordEnd] !== "\n") {
        wordEnd++;
      }

      // 光标必须在 @词 范围内
      if (pos <= atIdx || pos > wordEnd) return;

      const filePath = text.slice(atIdx + 1, wordEnd);
      if (filePath && (filePath.includes(".") || filePath.includes("/"))) {
        onPreviewFile(filePath);
      }
    }, 0);
  }, [onPreviewFile]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // / Slash 命令自动补全导航
    if (showSlashAutocomplete && !showFileAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.min(prev + 1, slashCommands.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        const selected = slashCommands[slashSelectedIndex];
        if (selected) {
          selectSlashCommand(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowSlashAutocomplete(false);
        return;
      }
    }

    // @ 自动补全键盘导航
    if (showFileAutocomplete) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFileAutocompleteSelected((prev) =>
          Math.min(prev + 1, filesForAutocomplete.length - 1)
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFileAutocompleteSelected((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selected = filesForAutocomplete[fileAutocompleteSelected];
        if (selected) {
          selectAutocompleteFile(selected);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowFileAutocomplete(false);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const selected = filesForAutocomplete[fileAutocompleteSelected];
        if (selected) {
          selectAutocompleteFile(selected);
        }
        return;
      }
    }

    // 普通发送
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
          onClick={handleTextareaClick}
          placeholder="Ask anything, @ to mention, / for actions"
          rows={1}
        />

        {/* / Slash 命令自动补全下拉框 */}
        <SlashAutocomplete
          visible={showSlashAutocomplete && !showFileAutocomplete}
          commands={slashCommands}
          query={slashQuery}
          selectedIndex={slashSelectedIndex}
          onSelect={selectSlashCommand}
          onDismiss={() => setShowSlashAutocomplete(false)}
        />

        {/* @ 文件自动补全下拉框 */}
        <FileAutocomplete
          visible={showFileAutocomplete}
          files={filesForAutocomplete}
          selectedIndex={fileAutocompleteSelected}
          onSelect={selectAutocompleteFile}
          onDismiss={() => setShowFileAutocomplete(false)}
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
