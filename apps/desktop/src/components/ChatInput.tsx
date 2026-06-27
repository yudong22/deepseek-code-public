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
    <div className="active-chat-input-container">
      <ChatInputCard hasPendingQuestion={hasPendingQuestion} {...props} />
    </div>
  );
}
