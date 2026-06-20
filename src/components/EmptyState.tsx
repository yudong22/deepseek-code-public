import React, { useRef, useEffect } from "react";
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="empty-state-container">
      <div className="empty-state-header">
        <Icons.Folder />
        <span>deepseek-code</span>
        <Icons.ChevronDown />
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
