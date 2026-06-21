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
  /** 已有回复内容（页面刷新后从 ToolSuccess result 恢复） */
  result?: string;
}

/** 从工具调用的 result 字段提取用户回答文本 */
function parseAnswerFromResult(result?: string): string | null {
  if (!result) return null;
  try {
    const parsed = JSON.parse(result);
    return parsed.answer || parsed.text || parsed.content || result;
  } catch {
    return result;
  }
}

export default function QuestionCard({ args, callId, onAnswered, result }: QuestionCardProps) {
  const savedAnswer = parseAnswerFromResult(result);
  const [selectedOption, setSelectedOption] = useState<string | null>(
    savedAnswer && args ? guessSelectedOption(args, savedAnswer) : null
  );
  const [customInput, setCustomInput] = useState(savedAnswer && !guessSelectedOption(args || "", savedAnswer) ? savedAnswer : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(!!savedAnswer);

/** 从 args 和 answer 匹配选中的选项 label */
function guessSelectedOption(args: string, answer: string): string | null {
  try {
    const data = JSON.parse(args);
    const options = data.questions?.[0]?.options || [];
    for (const opt of options) {
      if (opt.label === answer) return opt.label;
    }
  } catch {}
  return null;
}

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

  const doneAnswer = selectedOption || customInput;

  return (
    <div className={`question-card ${isDone ? "done" : ""}`}>
      <div className="question-card-header">
        <span>{header || "Agent 提问"}</span>
        {isDone && <span className="question-card-done-badge">已回复</span>}
      </div>
      <div className="question-card-text">
        {questionText}
      </div>

      {options.length > 0 && (
        <div className="question-card-options">
          {options.map((opt, i) => {
            const isSelected = selectedOption === opt.label;
            return (
              <button
                key={i}
                className={`question-card-option ${isSelected ? "selected" : ""} ${isDone ? "frozen" : ""}`}
                onClick={() => !isDone && handleSelect(opt.label)}
                disabled={isDone || isSubmitting}
              >
                <span className="question-card-radio">
                  {isSelected ? "✓" : i + 1}
                </span>
                <span className="question-card-option-label">
                  {opt.label}
                  {opt.description && (
                    <span className="question-card-option-desc">{opt.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="question-card-input-row">
        <input
          type="text"
          className="question-card-input"
          value={isDone ? doneAnswer : customInput}
          onChange={(e) => !isDone && setCustomInput(e.target.value)}
          onKeyDown={(e) => !isDone && e.key === "Enter" && handleCustomSubmit()}
          placeholder={options.length > 0 ? "或者输入自定义回复..." : "输入你的回复..."}
          disabled={isDone || isSubmitting}
          readOnly={isDone}
        />
        <button
          className="question-card-send-btn"
          onClick={handleCustomSubmit}
          disabled={isDone || !customInput.trim() || isSubmitting}
        >
          {isDone ? "已发送" : "发送"}
        </button>
      </div>
    </div>
  );
}
