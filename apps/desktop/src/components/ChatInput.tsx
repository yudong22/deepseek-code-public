import ChatInputCard from "./ChatInputCard";

interface ChatInputProps {
  inputText: string;
  selectedModel: string;
  isModelDropdownOpen: boolean;
  isGenerating?: boolean;
  hasPendingQuestion?: boolean;
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

export default function ChatInput({ hasPendingQuestion, ...props }: ChatInputProps) {
  return (
    <div className="px-4 pb-4 pt-3 bg-white dark:bg-[#1c1c1e] border-t border-[#e3e3e3] dark:border-[#2c2c2e] shrink-0">
      <div className="max-w-[740px] mx-auto">
        <ChatInputCard hasPendingQuestion={hasPendingQuestion} {...props} />
      </div>
    </div>
  );
}
