import React, { useRef, useEffect, useState, useCallback } from "react";
import * as Icons from "@/components/Icons";
import FileAutocomplete from "@/components/FileAutocomplete";
import SlashAutocomplete, { filterSlashCommands } from "@/components/SlashAutocomplete";
import { fileBaseName } from "./toolUtils";

/** @ 引用文件 chip 数据 */
interface AttachedFile {
  fullPath: string;
  name: string;
  icon: string;
}

interface ChatInputCardProps {
  inputText: string;
  selectedModel: string;
  isModelDropdownOpen: boolean;
  isGenerating?: boolean;
  hasPendingQuestion?: boolean;
  planMode?: boolean;
  onInputChange: (value: string) => void;
  onSend: (attachedFiles?: string[]) => void;
  onCancel?: () => void;
  onToggleModelDropdown: () => void;
  onSelectModel: (model: string) => void;
  workspacePath?: string;
  onListFiles?: () => Promise<string[]>;
  onPreviewFile?: (relativePath: string) => void;
}

/** 根据文件扩展名返回图标 */
function getFileIcon(file: string): string {
  if (file.endsWith(".tsx") || file.endsWith(".ts")) return "📘";
  if (file.endsWith(".jsx") || file.endsWith(".js")) return "📒";
  if (file.endsWith(".rs")) return "🦀";
  if (file.endsWith(".md")) return "📝";
  if (file.endsWith(".json")) return "📋";
  if (file.endsWith(".css")) return "🎨";
  if (file.endsWith(".html")) return "🌐";
  if (file.endsWith(".toml") || file.endsWith(".yaml") || file.endsWith(".yml")) return "⚙️";
  if (file.endsWith(".py")) return "🐍";
  if (file.endsWith(".go")) return "🔷";
  if (file.endsWith(".sql")) return "🗃️";
  if (file.endsWith(".sh") || file.endsWith(".bash")) return "💻";
  if (file.endsWith(".svg") || file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) return "🖼️";
  return "📄";
}

/** data 属性名，用于标识 chip 节点 */
const CHIP_DATA_PATH = "data-file-path";
const CHIP_DATA_NAME = "data-file-name";
const CHIP_DATA_ICON = "data-file-icon";
const CHIP_CLASS = "inline-file-chip";

/** 创建 chip DOM 节点 */
function createChipElement(file: AttachedFile): HTMLSpanElement {
  const chip = document.createElement("span");
  chip.className = CHIP_CLASS;
  chip.setAttribute(CHIP_DATA_PATH, file.fullPath);
  chip.setAttribute(CHIP_DATA_NAME, file.name);
  chip.setAttribute(CHIP_DATA_ICON, file.icon);
  chip.contentEditable = "false";
  chip.style.cssText =
    "display:inline-flex;align-items:center;gap:3px;padding:1px 7px;" +
    "background:var(--color-surface-secondary,#f2f2f7);border:1px solid var(--color-border-primary,#e3e3e3);" +
    "border-radius:6px;font-size:12px;font-weight:500;cursor:pointer;" +
    "color:var(--color-label-primary,#111);vertical-align:baseline;" +
    "margin:0 1px;transition:background 0.15s,border-color 0.15s;";
  chip.title = file.fullPath;
  chip.innerHTML = `<span style="font-size:12px;line-height:1">${file.icon}</span><span style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</span>`;
  return chip;
}

/** 从 contenteditable 提取纯文本和 @file 引用 */
function extractContent(el: HTMLElement): { text: string; files: string[] } {
  const files: string[] = [];
  const textParts: string[] = [];
  const seen = new Set<string>();

  for (const node of Array.from(el.childNodes)) {
    if (
      node instanceof HTMLSpanElement &&
      node.classList.contains(CHIP_CLASS)
    ) {
      const path = node.getAttribute(CHIP_DATA_PATH) || "";
      if (path && !seen.has(path)) {
        files.push(path);
        seen.add(path);
      }
      textParts.push(`@file://${path}`);
    } else if (node instanceof HTMLBRElement) {
      textParts.push("\n");
    } else {
      textParts.push(node.textContent || "");
    }
  }
  return { text: textParts.join(""), files };
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
  const editorRef = useRef<HTMLDivElement>(null);
  // 跟踪是否由程序同步（避免循环）
  const syncingRef = useRef(false);

  // --- @ 文件自动补全状态 ---
  const [allWorkspaceFiles, setAllWorkspaceFiles] = useState<string[]>([]);
  const [filesForAutocomplete, setFilesForAutocomplete] = useState<string[]>([]);
  const [showFileAutocomplete, setShowFileAutocomplete] = useState(false);
  const [fileAutocompleteSelected, setFileAutocompleteSelected] = useState(0);

  // @ 触发检测所需：保存 @query 的 DOM Range 引用（失焦后仍有效）
  const atQueryRef = useRef<{ start: number; query: string; node: Text } | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

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

  // 检测 / 触发
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
      syncingRef.current = true;
      onInputChange("/" + cmd.name + " ");
      setShowSlashAutocomplete(false);
      // 还原编辑器内容
      if (editorRef.current) {
        editorRef.current.textContent = "/" + cmd.name + " ";
        const range = document.createRange();
        range.selectNodeContents(editorRef.current);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        editorRef.current.focus();
      }
      syncingRef.current = false;
    },
    [onInputChange]
  );

  // 从编辑器中光标前找 @query
  const getAtQuery = useCallback((): { query: string; startNode: Text; startOffset: number } | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;
    const text = range.startContainer.textContent || "";
    const cursorPos = range.startOffset;
    const textBefore = text.slice(0, cursorPos);
    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx === -1) return null;
    const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : " ";
    // Accept regular space, non-breaking space (&nbsp;), or start of text node
    const isSeparator = charBefore === " " || charBefore === " " || atIdx === 0;
    if (!isSeparator) return null;
    const q = textBefore.slice(atIdx + 1);
    if (q.includes(" ") || q.includes("\n")) return null;
    return { query: q, startNode: range.startContainer as Text, startOffset: atIdx };
  }, []);

  // 输入事件同步到父组件 + 检测 @ 触发
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el || syncingRef.current) return;
    const { text } = extractContent(el);
    onInputChange(text);

    const atQ = getAtQuery();
    if (atQ) {
      atQueryRef.current = { start: atQ.startOffset, query: atQ.query, node: atQ.startNode };
      // 保存当前 Range 以便失焦后恢复
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        savedRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
      const filtered = allWorkspaceFiles.filter((f) =>
        f.toLowerCase().includes(atQ.query.toLowerCase())
      );
      setFilesForAutocomplete(filtered.slice(0, 20));
      setFileAutocompleteSelected(0);
      setShowFileAutocomplete(filtered.length > 0);
    } else {
      setShowFileAutocomplete(false);
      atQueryRef.current = null;
    }
  }, [onInputChange, allWorkspaceFiles, getAtQuery]);

  // 选中自动补全文件 → 在保存的 Range 位置插入 chip
  const selectAutocompleteFile = useCallback(
    (filePath: string) => {
      const el = editorRef.current;
      if (!el) return;

      const atQ = atQueryRef.current;
      if (!atQ) return;

      // 恢复光标位置
      el.focus();
      const sel = window.getSelection();
      if (!sel) return;

      const textNode = atQ.node;
      if (!textNode || !textNode.parentNode || !el.contains(textNode)) {
        // textNode 已失效，回退到直接追加
        const chip = createChipElement({ fullPath: filePath, name: fileBaseName(filePath), icon: getFileIcon(filePath) });
        el.appendChild(chip);
        el.appendChild(document.createTextNode(" "));
      } else {
        const origText = textNode.textContent || "";
        const chip = createChipElement({
          fullPath: filePath,
          name: fileBaseName(filePath),
          icon: getFileIcon(filePath),
        });

        // 用保存的 range 获取光标偏移，否则用 textNode 末尾
        const cursorOffset = savedRangeRef.current
          ? (savedRangeRef.current.startContainer === textNode ? savedRangeRef.current.startOffset : origText.length)
          : origText.length;

        const before = origText.slice(0, atQ.start);
        const after = origText.slice(cursorOffset);

        const parent = textNode.parentNode;

        if (before) {
          const beforeNode = document.createTextNode(before);
          parent.insertBefore(beforeNode, textNode);
        }
        parent.insertBefore(chip, textNode);

        // chip 后插入空格 + 原光标后文本（确保 chip 后总有空格分隔）
        // 使用   防止 contenteditable 吞掉尾部空格
        const afterText = after.startsWith(" ") ? after : " " + after;
        const afterNode = document.createTextNode(afterText);
        parent.insertBefore(afterNode, textNode);
        parent.removeChild(textNode);

        const newRange = document.createRange();
        // 光标放在空格之后（position 1）或 after 开头已有空格时 position 0
        const cursorPos = after.startsWith(" ") ? 0 : 1;
        newRange.setStart(afterNode, cursorPos);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      setShowFileAutocomplete(false);
      atQueryRef.current = null;
      savedRangeRef.current = null;

      if (onPreviewFile) {
        onPreviewFile(filePath);
      }

      const { text } = extractContent(el);
      syncingRef.current = true;
      onInputChange(text);
      syncingRef.current = false;
    },
    [onInputChange, onPreviewFile]
  );

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
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
          if (selected) selectSlashCommand(selected);
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
          setFileAutocompleteSelected((prev) => Math.min(prev + 1, filesForAutocomplete.length - 1));
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
          if (selected) selectAutocompleteFile(selected);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const selected = filesForAutocomplete[fileAutocompleteSelected];
          if (selected) selectAutocompleteFile(selected);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowFileAutocomplete(false);
          return;
        }
      }

      if (e.key === "Escape" && isGenerating && onCancel) {
        onCancel();
        return;
      }

      // Backspace：光标紧邻 chip 前方时删除该 chip
      if (e.key === "Backspace") {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (
            range.startContainer.nodeType === Node.TEXT_NODE &&
            range.startOffset === 0
          ) {
            // 光标在 text 节点开头，检查前一个兄弟是否是 chip
            const prev = range.startContainer.previousSibling;
            if (
              prev instanceof HTMLSpanElement &&
              prev.classList.contains(CHIP_CLASS)
            ) {
              e.preventDefault();
              prev.remove();
              // 同步
              const el = editorRef.current;
              if (el) {
                const { text } = extractContent(el);
                syncingRef.current = true;
                onInputChange(text);
                syncingRef.current = false;
              }
              return;
            }
          }
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const el = editorRef.current;
        if (!el) return;
        const { files } = extractContent(el);
        onSend(files.length > 0 ? files : undefined);
        syncingRef.current = true;
        onInputChange("");
        el.innerHTML = "";
        syncingRef.current = false;
      }
    },
    [showSlashAutocomplete, showFileAutocomplete, slashCommands, slashSelectedIndex, filesForAutocomplete, fileAutocompleteSelected, isGenerating, onCancel, onInputChange, onSend, selectSlashCommand, selectAutocompleteFile]
  );

  // 处理点击 chip
  const handleEditorClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      // 检查是否点击了 chip 或 chip 内部
      const chip = target.closest(`.${CHIP_CLASS}`) as HTMLElement | null;
      if (chip) {
        const path = chip.getAttribute(CHIP_DATA_PATH);
        if (path && onPreviewFile) {
          e.preventDefault();
          onPreviewFile(path);
        }
      }
    },
    [onPreviewFile]
  );

  const handlePlusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = editorRef.current;
    const { text } = el ? extractContent(el) : { text: inputText };
    const appendText = text.length === 0 || text.endsWith(" ") ? "@" : " @";
    syncingRef.current = true;
    onInputChange(text + appendText);
    if (el) {
      el.focus();
      // 在末尾插入 @
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      document.execCommand("insertText", false, appendText);
    }
    syncingRef.current = false;
  };

  // 同步 inputText → contenteditable（仅外部变化时）
  useEffect(() => {
    if (syncingRef.current) return;
    const el = editorRef.current;
    if (!el) return;
    // 只在内容确实不同时更新（避免光标跳动）
    const { text } = extractContent(el);
    if (text !== inputText) {
      syncingRef.current = true;
      // 保持简单：如果 inputText 为空则清空
      if (!inputText) {
        el.innerHTML = "";
      }
      // 其他情况不主动覆盖（避免打断用户输入）
      syncingRef.current = false;
    }
  }, [inputText]);

  // Auto-resize
  useEffect(() => {
    const el = editorRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [inputText]);

  return (
    <div className="relative flex flex-col bg-surface-secondary rounded-xl w-full transition-all duration-200 shadow-sm">
      <div
        ref={editorRef}
        className="w-full bg-transparent border-0 outline-none text-[13px] text-zinc-800 dark:text-label-primary placeholder-zinc-400 dark:placeholder-zinc-500 overflow-y-auto px-4 pt-3 pb-2.5 min-h-[38px] max-h-48"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={planMode ? "规划模式下提问，Agent 仅分析和规划…" : "Ask anything, @ to mention, / for actions"}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        spellCheck={false}
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
            className="bg-surface-secondary hover:bg-surface-hover border-0 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md transition-colors flex items-center justify-center"
            onClick={handlePlusClick}
            title="Add Context"
          >
            <Icons.Plus />
          </button>
          <div className="relative flex items-center">
            <button
              className="flex items-center gap-1 bg-surface-secondary hover:bg-surface-hover text-[12px] font-medium text-label-secondary dark:text-label-secondary px-2 py-1 rounded-md transition-colors border-0 cursor-pointer"
              onClick={(e) => { e.stopPropagation(); onToggleModelDropdown(); }}
            >
              <span>{selectedModel}</span>
              <Icons.ChevronDown />
            </button>
            {isModelDropdownOpen && (
              <div className="absolute bottom-full left-0 mb-1 bg-surface-secondary rounded-lg shadow-lg z-50 py-1 w-44 flex flex-col overflow-hidden">
                <div
                  className={`px-3 py-1.5 text-[13px] hover:bg-surface-secondary hover:bg-surface-hover cursor-pointer transition-colors ${
                    selectedModel === "deepseek-v4-flash" ? "text-brand-blue font-medium" : "text-zinc-700 dark:text-zinc-300"
                  }`}
                  onClick={() => onSelectModel("deepseek-v4-flash")}
                >
                  deepseek-v4-flash
                </div>
                <div
                  className={`px-3 py-1.5 text-[13px] hover:bg-surface-secondary hover:bg-surface-hover cursor-pointer transition-colors ${
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
              className="w-7 h-7 flex items-center justify-center bg-surface-secondary hover:bg-surface-hover text-[#333] dark:text-[#d0d0d0] rounded-full cursor-pointer border-0 transition-colors"
              onClick={onCancel}
              title="Stop"
            >
              <Icons.Stop />
            </button>
          ) : (editorRef.current?.textContent?.trim() || hasPendingQuestion) ? (
            <button
              className="w-7 h-7 flex items-center justify-center bg-deepseek-400 dark:bg-deepseek-200 text-white dark:text-deepseek-600 hover:bg-deepseek-500 dark:hover:bg-deepseek-100 rounded-full cursor-pointer border-0 transition-colors"
              onClick={() => {
                const el = editorRef.current;
                if (!el) return;
                const { files } = extractContent(el);
                onSend(files.length > 0 ? files : undefined);
                syncingRef.current = true;
                onInputChange("");
                el.innerHTML = "";
                syncingRef.current = false;
              }}
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
