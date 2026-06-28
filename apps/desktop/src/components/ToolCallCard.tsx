import {
  ToolCallData,
  normalizeToolName,
  EDIT_TOOLS,
  PREVIEW_TOOLS,
} from "./toolUtils";
import TodoListCard from "./TodoListCard";
import EditDiffCard from "./EditDiffCard";
import FileToolCard from "./FileToolCard";
import ExpandableToolCard from "./ExpandableToolCard";
import QuestionCard from "./QuestionCard";
import type { Tab } from "./RightPanel/PanelShell";

interface ToolCallCardProps {
  toolCall: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: Tab) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
  onAnswerQuestion?: (answer: string) => void;
}

export default function ToolCallCard({
  toolCall: tc,
  messageId,
  index,
  onOpenTab,
  onCancel,
  readFile,
  getFileUrl,
  onAnswerQuestion,
}: ToolCallCardProps) {
  const name = normalizeToolName(tc.name);

  if (name === "question") {
    return (
      <QuestionCard
        args={tc.args || "{}"}
        callId={tc.call_id || ""}
        result={tc.result}
        onAnswered={onAnswerQuestion}
      />
    );
  }

  if (name === "todowrite") {
    return <TodoListCard tc={tc} onCancel={onCancel} />;
  }

  if (EDIT_TOOLS.has(name)) {
    return (
      <EditDiffCard
        tc={tc}
        messageId={messageId}
        index={index}
        onOpenTab={onOpenTab}
        onCancel={onCancel}
        readFile={readFile}
        getFileUrl={getFileUrl}
      />
    );
  }

  if (PREVIEW_TOOLS.has(name)) {
    return (
      <FileToolCard
        tc={tc}
        messageId={messageId}
        index={index}
        onOpenTab={onOpenTab}
        onCancel={onCancel}
        readFile={readFile}
        getFileUrl={getFileUrl}
      />
    );
  }

  return <ExpandableToolCard tc={tc} onCancel={onCancel} />;
}

interface ToolCallGroupProps {
  toolCalls: ToolCallData[];
  messageId: string;
  onOpenTab: (tab: Tab) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
  onAnswerQuestion?: (answer: string) => void;
}

export function ToolCallGroup({
  toolCalls,
  messageId,
  onOpenTab,
  onCancel,
  readFile,
  getFileUrl,
  onAnswerQuestion,
}: ToolCallGroupProps) {
  return (
    <div className="flex flex-col gap-1 my-2">
      {toolCalls.map((tc, idx) => {
        const stableKey = tc.call_id || `tc-${idx}`;
        return (
          <ToolCallCard
            key={stableKey}
            toolCall={tc}
            messageId={messageId}
            index={idx}
            onOpenTab={onOpenTab}
            onCancel={onCancel}
            readFile={readFile}
            getFileUrl={getFileUrl}
            onAnswerQuestion={onAnswerQuestion}
          />
        );
      })}
    </div>
  );
}
export type { ToolCallData };
