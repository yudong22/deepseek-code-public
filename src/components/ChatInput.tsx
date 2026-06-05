import * as Icons from "@/components/Icons";

interface ChatInputProps {
  inputText: string;
  selectedModel: string;
  isModelDropdownOpen: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleModelDropdown: () => void;
  onSelectModel: (model: string) => void;
}

export default function ChatInput({
  inputText,
  selectedModel,
  isModelDropdownOpen,
  onInputChange,
  onSend,
  onToggleModelDropdown,
  onSelectModel,
}: ChatInputProps) {
  return (
    <div className="active-chat-input-container">
      <div className="active-chat-box">
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <button className="sidebar-tool-btn" style={{ padding: "0 4px" }} onClick={(e) => { e.stopPropagation(); onToggleModelDropdown(); }}>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#555" }}>{selectedModel}</span>
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

        <input
          className="active-chat-textarea"
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="Ask anything, @ to mention, / for actions"
        />
        <button className="sidebar-tool-btn" style={{ color: "#8a8a8f" }}>
          <Icons.Mic />
        </button>
        <button className="active-chat-send-btn" onClick={onSend}>
          <Icons.Send />
        </button>
      </div>
    </div>
  );
}
