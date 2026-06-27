import { useState } from "react";
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
  onAnswered?: (answer: string) => void;
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

export default function QuestionCard({ args, callId: _callId, onAnswered, result }: QuestionCardProps) {
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

  interface QuestionItem {
    question: string;
    header?: string;
    options?: QuestionOption[];
  }
  const question: Partial<QuestionItem> = questionData.questions?.[0] || {};
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
      onAnswered?.(answer);
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
      onAnswered?.(customInput.trim());
    } catch (e) {
      console.error("Failed to respond:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const doneAnswer = selectedOption || customInput;

  return (
    <div className={`bg-white dark:bg-[#1c1c1e] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 my-2 shadow-sm w-full flex flex-col gap-3 transition-all duration-200 ${isDone ? "opacity-90" : ""}`}>
      <div className="flex items-center justify-between text-[10px] font-bold text-[#8e8e93] tracking-wider uppercase">
        <span>{header || "Agent 提问"}</span>
        {isDone && <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-normal tracking-normal">已回复</span>}
      </div>
      <div className="text-xs font-semibold text-zinc-800 dark:text-[#f5f5f7] leading-relaxed">
        {questionText}
      </div>

      {options.length > 0 && (
        <div className="flex flex-col gap-2">
          {options.map((opt, i) => {
            const isSelected = selectedOption === opt.label;
            return (
              <button
                key={i}
                className={`w-full min-h-12 border rounded-lg px-3.5 py-2.5 flex items-center gap-3 cursor-pointer text-left transition-colors bg-[#f9f9fb] dark:bg-[#1c1c1e] ${
                  isSelected 
                    ? "border-zinc-400 dark:border-zinc-500 bg-zinc-50 dark:bg-zinc-800/30" 
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-350 dark:hover:border-zinc-700"
                } ${isDone ? "opacity-75 cursor-default hover:border-zinc-200 dark:hover:border-zinc-800" : ""}`}
                onClick={() => !isDone && handleSelect(opt.label)}
                disabled={isDone || isSubmitting}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border ${
                  isSelected 
                    ? "bg-zinc-600 dark:bg-zinc-400 text-white dark:text-zinc-900 border-zinc-600 dark:border-zinc-400" 
                    : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
                }`}>
                  {isSelected ? "✓" : i + 1}
                </span>
                <span className="flex flex-col text-xs font-semibold text-zinc-800 dark:text-[#f5f5f7]">
                  {opt.label}
                  {opt.description && (
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-550 font-normal mt-0.5">{opt.description}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 h-8 px-3 bg-[#f2f2f7] dark:bg-[#2c2c2e] hover:bg-[#e5e5ea] dark:hover:bg-[#3a3a3c] border-0 rounded-md text-xs outline-none text-zinc-800 dark:text-[#f5f5f7] placeholder-zinc-400 dark:placeholder-zinc-600 transition-colors"
          value={isDone ? doneAnswer : customInput}
          onChange={(e) => !isDone && setCustomInput(e.target.value)}
          onKeyDown={(e) => !isDone && e.key === "Enter" && handleCustomSubmit()}
          placeholder={options.length > 0 ? "或者输入自定义回复..." : "输入你的回复..."}
          disabled={isDone || isSubmitting}
          readOnly={isDone}
        />
        <button
          className="h-8 px-4 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-0 rounded-md text-[13px] font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          onClick={handleCustomSubmit}
          disabled={isDone || !customInput.trim() || isSubmitting}
        >
          {isDone ? "已发送" : "发送"}
        </button>
      </div>
    </div>
  );
}
