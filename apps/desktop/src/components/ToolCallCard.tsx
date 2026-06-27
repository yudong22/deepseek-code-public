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

interface ToolCallCardProps {
  toolCall: ToolCallData;
  messageId: string;
  index: number;
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}

export default function ToolCallCard({
  toolCall: tc,
  messageId,
  index,
  onOpenTab,
  onCancel,
  readFile,
  getFileUrl,
}: ToolCallCardProps) {
  const name = normalizeToolName(tc.name);

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
  onOpenTab: (tab: { id: string; title: string; type: string; content: string; language?: string }) => void;
  onCancel?: () => void;
  readFile?: (relativePath: string) => Promise<string>;
  getFileUrl?: (relativePath: string) => Promise<string>;
}

export function ToolCallGroup({
  toolCalls,
  messageId,
  onOpenTab,
  onCancel,
  readFile,
  getFileUrl,
}: ToolCallGroupProps) {
  return (
    <div className="tc-group-terminal" style={{
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      margin: "8px 0",
    }}>
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
          />
        );
      })}
    </div>
  );
}
export type { ToolCallData };
