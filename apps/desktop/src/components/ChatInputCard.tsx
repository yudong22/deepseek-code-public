import React, { useRef, useEffect, useState, useCallback } from "react";
import * as Icons from "@/components/Icons";
import FileAutocomplete from "@/components/FileAutocomplete";
import SlashAutocomplete, { filterSlashCommands } from "@/components/SlashAutocomplete";

interface ChatInputCardProps {
  inputText: string;
  selectedModel: string;
  isModelDropdownOpen: boolean;
  isGenerating?: boolean;
  hasPendingQuestion?: boolean;
  planMode?: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  onToggleModelDropdown: () => void;
  onSelectModel: (model: string) => void;
  /** 当前工作区路径 */
  workspacePath?: string;
  /** 列出工作区文件 */
  onListFiles?: () => Promise<string[]>;
  /** 在右侧面板预览文件 */
  onPreviewFile?: (relativePath: string) => void;
}

export default function ChatInputCard({
  inputText,
  selectedModel,
  isModelDropdownOpen,
  isGenerating,
  hasPendingQuestion,
  planMode,
  onInputChange,
  onSend,
  onCancel,
  onToggleModelDropdown,
  onSelectModel,
  workspacePath,
  onListFiles,
  onPreviewFile,
}: ChatInputCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  }, [workspacePath, onListFiles]);

  // --- / Slash 命令自动补全 ---
  const [slashCommands, setSlashCommands] = useState<{ name: string; aliases: string[]; description: string; icon: string }[]>([]);
  const [showSlashAutocomplete, setShowSlashAutocomplete] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);

  // 检测 / 触发（只有输入以 / 开头且在行首输入时才激活）
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

      const atIdx = text.lastIndexOf("@", pos);
      if (atIdx === -1) return;

      if (atIdx > 0 && text[atIdx - 1] !== " ") return;

      let wordEnd = atIdx + 1;
      while (wordEnd < text.length && text[wordEnd] !== " " && text[wordEnd] !== "\n") {
        wordEnd++;
      }

      if (pos <= atIdx || pos > wordEnd) return;

      const filePath = text.slice(atIdx + 1, wordEnd);
      if (filePath && (filePath.includes(".") || filePath.includes("/"))) {
        onPreviewFile(filePath);
      }
    }, 0);
  }, [onPreviewFile]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    if (e.key === "Escape" && isGenerating && onCancel) {
      onCancel();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative flex flex-col bg-white dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-700 rounded-xl w-full transition-all duration-200 shadow-sm focus-within:border-zinc-400 dark:focus-within:border-zinc-500">
      <textarea
        ref={textareaRef}
        className="w-full bg-transparent border-0 outline-none text-[13px] text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-500 resize-none max-h-48 overflow-y-auto px-4 pt-3 pb-2"
        value={inputText}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onClick={handleTextareaClick}
        placeholder={planMode ? "规划模式下提问，Agent 仅分析和规划…" : "Ask anything, @ to mention, / for actions"}
        rows={1}
      />

      <SlashAutocomplete
        visible={showSlashAutocomplete && !showFileAutocomplete}
        commands={slashCommands}
        query={slashQuery}
        selectedIndex={slashSelectedIndex}
        onSelect={selectSlashCommand}
        onDismiss={() => setShowSlashAutocomplete(false)}
      />

      <FileAutocomplete
        visible={showFileAutocomplete}
        files={filesForAutocomplete}
        selectedIndex={fileAutocompleteSelected}
        onSelect={selectAutocompleteFile}
        onDismiss={() => setShowFileAutocomplete(false)}
      />

      <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
        <div className="flex items-center gap-1.5">
          <button
            className="bg-transparent border-0 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md transition-colors flex items-center justify-center"
            onClick={handlePlusClick}
            title="Add Context"
          >
            <Icons.Plus />
          </button>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button
              className="flex items-center gap-1 bg-transparent hover:bg-zinc-100 dark:hover:bg-[#3a3a3c] text-[12px] font-medium text-zinc-500 dark:text-zinc-400 px-2 py-1 rounded-md transition-colors border-0 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onToggleModelDropdown(); }}
            >
              <span>{selectedModel}</span>
              <Icons.ChevronDown />
            </button>
            {isModelDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-[#2c2c2e] border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 py-1 w-44 flex flex-col overflow-hidden">
                <div
                  className={`px-3 py-1.5 text-[13px] hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c] cursor-pointer transition-colors ${
                    selectedModel === "deepseek-v4-flash" ? "text-brand-blue font-medium" : "text-zinc-700 dark:text-zinc-300"
                  }`}
                  onClick={() => onSelectModel("deepseek-v4-flash")}
                >
                  deepseek-v4-flash
                </div>
                <div
                  className={`px-3 py-1.5 text-[13px] hover:bg-[#f2f2f7] dark:hover:bg-[#3a3a3c] cursor-pointer transition-colors ${
                    selectedModel === "deepseek-v4-pro" ? "text-brand-blue font-medium" : "text-zinc-700 dark:text-zinc-300"
                  }`}
                  onClick={() => onSelectModel("deepseek-v4-pro")}
                >
                  deepseek-v4-pro
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="bg-transparent border-0 text-zinc-400/30 dark:text-zinc-600/30 p-1 rounded-md flex items-center justify-center opacity-30 cursor-not-allowed"
            title="语音输入即将推出"
            disabled
          >
            <Icons.Mic />
          </button>
          {isGenerating && !hasPendingQuestion ? (
            <button
              className="w-7 h-7 flex items-center justify-center bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 rounded-full cursor-pointer border-0 transition-colors"
              onClick={onCancel}
              title="Stop"
            >
              <Icons.Stop />
            </button>
          ) : inputText.trim() || hasPendingQuestion ? (
            <button
              className="w-7 h-7 flex items-center justify-center bg-zinc-800 dark:bg-zinc-200 hover:bg-zinc-700 dark:hover:bg-white text-white dark:text-zinc-900 rounded-full cursor-pointer border-0 transition-colors"
              onClick={onSend}
              title="Send"
            >
              <Icons.ArrowRight />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
