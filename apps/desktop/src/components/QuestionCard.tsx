import React, { useState } from "react";
import { bridge } from "@/bridge";

interface QuestionOption {
  label: string;
  description?: string;
}

interface QuestionData {
  question?: string;
  questions?: Array<{
    question: string;
    header?: string;
    options?: QuestionOption[];
  }>;
}

interface QuestionCardProps {
  args: string;
  callId: string;
  onAnswered?: () => void;
}

export default function QuestionCard({ args, callId, onAnswered }: QuestionCardProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  let questionData: QuestionData = {};
  try {
    questionData = JSON.parse(args);
  } catch {}

  const question = questionData.questions?.[0] || {};
  const questionText = questionData.question || question.question || "Agent 需要你确认";
  const header = question.header || "";
  const options = question.options || [];

  const handleSelect = async (answer: string) => {
    if (isSubmitting || isDone) return;
    setIsSubmitting(true);
    setSelectedOption(answer);
    try {
      await bridge.respondToAgent(answer);
      setIsDone(true);
      onAnswered?.();
    } catch (e) {
      console.error("Failed to respond:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCustomSubmit = async () => {
    if (!customInput.trim() || isSubmitting || isDone) return;
    setIsSubmitting(true);
    try {
      await bridge.respondToAgent(customInput.trim());
      setIsDone(true);
      onAnswered?.();
    } catch (e) {
      console.error("Failed to respond:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isDone) {
    return (
      <div style={{
        background: "var(--bg-secondary, #f5f5f5)",
        borderRadius: 12,
        padding: "12px 16px",
        margin: "8px 0",
        border: "1px solid var(--border-color, #e0e0e0)",
        opacity: 0.7,
      }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary, #666)" }}>
          ✅ 已回复: {selectedOption || customInput}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--bg-secondary, #f0f4ff)",
      borderRadius: 12,
      padding: "16px",
      margin: "8px 0",
      border: "1px solid var(--accent-color, #4A90D9)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    }}>
      {/* Header */}
      {header && (
        <div style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          color: "var(--accent-color, #4A90D9)",
          marginBottom: 8,
          letterSpacing: "0.5px",
        }}>
          {header}
        </div>
      )}

      {/* Question text */}
      <div style={{
        fontSize: 14,
        fontWeight: 500,
        marginBottom: 12,
        color: "var(--text-primary, #1a1a1a)",
        lineHeight: 1.4,
      }}>
        ❓ {questionText}
      </div>

      {/* Options */}
      {options.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => handleSelect(opt.label)}
              disabled={isSubmitting}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${selectedOption === opt.label ? "var(--accent-color, #4A90D9)" : "var(--border-color, #ddd)"}`,
                background: selectedOption === opt.label
                  ? "var(--accent-bg, #e8f0fe)"
                  : "var(--bg-primary, #fff)",
                cursor: isSubmitting ? "not-allowed" : "pointer",
                fontSize: 13,
                textAlign: "left",
                color: "var(--text-primary, #1a1a1a)",
                transition: "all 0.15s ease",
                opacity: isSubmitting ? 0.6 : 1,
              }}
            >
              <span style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `2px solid ${selectedOption === opt.label ? "var(--accent-color, #4A90D9)" : "#ccc"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
                color: selectedOption === opt.label ? "var(--accent-color, #4A90D9)" : "#999",
              }}>
                {selectedOption === opt.label ? "✓" : i + 1}
              </span>
              <span>
                <span style={{ fontWeight: 500 }}>{opt.label}</span>
                {opt.description && (
                  <span style={{ display: "block", fontSize: 11, color: "var(--text-secondary, #888)", marginTop: 2 }}>
                    {opt.description}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Custom text input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
          placeholder={options.length > 0 ? "或者输入自定义回复..." : "输入你的回复..."}
          disabled={isSubmitting}
          style={{
            flex: 1,
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--border-color, #ddd)",
            fontSize: 13,
            outline: "none",
            background: "var(--bg-primary, #fff)",
          }}
        />
        <button
          onClick={handleCustomSubmit}
          disabled={!customInput.trim() || isSubmitting}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: !customInput.trim() || isSubmitting ? "#ccc" : "var(--accent-color, #4A90D9)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            cursor: !customInput.trim() || isSubmitting ? "not-allowed" : "pointer",
          }}
        >
          发送
        </button>
      </div>

      <div style={{ fontSize: 11, color: "var(--text-secondary, #999)", marginTop: 8, textAlign: "center" }}>
        选择一个选项或输入自定义回复后按回车
      </div>
    </div>
  );
}
