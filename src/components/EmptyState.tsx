import * as Icons from "@/components/Icons";

interface EmptyStateProps {
  inputText: string;
  selectedModel: string;
  isModelDropdownOpen: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onToggleModelDropdown: () => void;
  onSelectModel: (model: string) => void;
}

export default function EmptyState({
  inputText,
  selectedModel,
  isModelDropdownOpen,
  onInputChange,
  onSend,
  onToggleModelDropdown,
  onSelectModel,
}: EmptyStateProps) {
  return (
    <div className="empty-state-container">
      <div className="empty-state-header">
        <Icons.Folder />
        <span>deepseek-code</span>
        <Icons.ChevronDown />
      </div>

      <div className="centered-prompt-box">
        <textarea
          className="prompt-textarea"
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), onSend())}
          placeholder="Ask anything, @ to mention, / for actions"
        />
        <div className="prompt-toolbar">
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button className="model-selector-pill" onClick={(e) => { e.stopPropagation(); onToggleModelDropdown(); }}>
              <span>{selectedModel}</span>
              <Icons.ChevronDown />
            </button>
            {isModelDropdownOpen && (
              <div className="model-dropdown">
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
          <button className="sidebar-tool-btn" style={{ color: "#8a8a8f" }}>
            <Icons.Mic />
          </button>
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
