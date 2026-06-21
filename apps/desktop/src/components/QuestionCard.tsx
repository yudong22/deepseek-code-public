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

  // 已回复状态
  if (isDone) {
    return (
      <div className="question-card done">
        <span className="question-card-done-icon">✅</span>
        <span className="question-card-done-text">已回复: {selectedOption || customInput}</span>
      </div>
    );
  }

  return (
    <div className="question-card">
      <div className="question-card-header">
        {header || "Agent 提问"}
      </div>
      <div className="question-card-text">
        {questionText}
      </div>

      {options.length > 0 && (
        <div className="question-card-options">
          {options.map((opt, i) => (
            <button
              key={i}
              className={`question-card-option ${selectedOption === opt.label ? "selected" : ""}`}
              onClick={() => handleSelect(opt.label)}
              disabled={isSubmitting}
            >
              <span className="question-card-radio">
                {selectedOption === opt.label ? "✓" : i + 1}
              </span>
              <span className="question-card-option-label">
                {opt.label}
                {opt.description && (
                  <span className="question-card-option-desc">{opt.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="question-card-input-row">
        <input
          type="text"
          className="question-card-input"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
          placeholder={options.length > 0 ? "或者输入自定义回复..." : "输入你的回复..."}
          disabled={isSubmitting}
        />
        <button
          className="question-card-send-btn"
          onClick={handleCustomSubmit}
          disabled={!customInput.trim() || isSubmitting}
        >
          发送
        </button>
      </div>
    </div>
  );
}
