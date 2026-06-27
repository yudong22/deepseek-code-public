import { ToolCallData, useElapsed } from "./toolUtils";

interface TodoItem {
  text: string;
  status: string; // "pending" | "in_progress" | "completed"
}

interface TodoListCardProps {
  tc: ToolCallData;
  onCancel?: () => void;
}

function parseTodoItems(tc: ToolCallData): TodoItem[] {
  try {
    const parsed = JSON.parse(tc.args);
    const rawItems = parsed.todos || parsed.items || parsed;
    if (Array.isArray(rawItems)) {
      return rawItems.map((item: any) => ({
        text: typeof item === "string" ? item : (item.text || item.content || JSON.stringify(item)),
        status: item.status || "pending",
      }));
    }
    if (typeof rawItems === "string") {
      const nested = JSON.parse(rawItems);
      if (Array.isArray(nested)) {
        return nested.map((item: any) => ({
          text: typeof item === "string" ? item : (item.text || item.content || JSON.stringify(item)),
          status: item.status || "pending",
        }));
      }
    }
  } catch {}
  return [];
}

export default function TodoListCard({ tc, onCancel }: TodoListCardProps) {
  const isDone = tc.result !== undefined;
  const isExecuting = tc.executing && !isDone;
  const elapsed = useElapsed(isDone, !!tc.executing);
  const items = parseTodoItems(tc);

  const doneCount = items.filter((i) => i.status === "completed").length;
  const totalCount = items.length;

  const statusIcon: Record<string, string> = {
    pending: "○",
    in_progress: "◐",
    completed: "●",
  };
  const statusColorClass: Record<string, string> = {
    pending: "text-zinc-400 dark:text-zinc-500",
    in_progress: "text-brand-blue",
    completed: "text-green-500",
  };

  const isAllDone = totalCount > 0 && doneCount === totalCount;
  const headerColorClass = isDone && isAllDone ? "text-green-500" : "text-brand-blue";

  return (
    <div className="text-xs my-1 px-3 py-2 bg-brand-blue/5 dark:bg-brand-blue/10 rounded-lg border-l-3 border-brand-blue font-sans">
      <div className={`flex items-center gap-2 font-semibold ${items.length > 0 ? "mb-1.5" : "mb-0"} ${headerColorClass}`}>
        <span>TODOs</span>
        {totalCount > 0 && (
          <span className="text-[11px] opacity-50 font-normal">
            {doneCount}/{totalCount}
          </span>
        )}
        <span className="text-[11px] opacity-35 font-normal ml-1">
          {elapsed}
        </span>
        {isExecuting && (
          <span className="text-[11px] opacity-60 font-normal italic">
            writing…
          </span>
        )}
        {onCancel && isExecuting && (
          <span
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            title="Cancel"
            className="cursor-pointer text-xs opacity-50 ml-auto px-1 py-0.5 rounded-sm hover:bg-black/10 transition-colors"
          >
            ✕
          </span>
        )}
      </div>

      {items.map((item, idx) => (
        <div 
          key={idx} 
          className={`flex items-start gap-1.5 py-0.5 ${
            item.status === "completed" ? "text-zinc-400 dark:text-zinc-500 line-through" : "text-zinc-800 dark:text-[#f5f5f7]"
          }`}
        >
          <span className={`text-sm shrink-0 mt-0.5 ${statusColorClass[item.status] || "text-zinc-400"}`}>
            {statusIcon[item.status] || "○"}
          </span>
          <span className="whitespace-pre-wrap break-all">
            {item.text}
          </span>
        </div>
      ))}

      {!isDone && items.length === 0 && (
        <div className="opacity-50 text-[11px] text-zinc-500">
          <span>正在生成待办列表…</span>
        </div>
      )}
    </div>
  );
}
