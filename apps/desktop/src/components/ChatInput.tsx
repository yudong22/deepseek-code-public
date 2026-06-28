import ChatInputCard from "./ChatInputCard";

interface ChatInputProps {
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
  /** 当前工作区路径 */
  workspacePath?: string;
  /** 列出工作区文件 */
  onListFiles?: () => Promise<string[]>;
  /** 在右侧面板预览文件 */
  onPreviewFile?: (relativePath: string) => void;
}

export default function ChatInput({ hasPendingQuestion, ...props }: ChatInputProps) {
  return (
    <div className={`px-4 pb-4 pt-3 shrink-0 border-t transition-colors duration-200 ${props.planMode ? "bg-amber-50/30 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-800/30" : "bg-white dark:bg-surface-primary border-border-primary"}`}>
      <div className="max-w-[740px] mx-auto">
        <ChatInputCard hasPendingQuestion={hasPendingQuestion} {...props} />
      </div>
    </div>
  );
}
