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
  const statusColor: Record<string, string> = {
    pending: "#8e8e93",
    in_progress: "#007aff",
    completed: "#34c759",
  };

  let headerColor = "#007aff";
  if (isDone) headerColor = totalCount > 0 && doneCount === totalCount ? "#34c759" : "#007aff";

  return (
    <div style={{
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: "12px",
      margin: "4px 0",
      padding: "8px 12px",
      background: "rgba(0, 122, 255, 0.04)",
      borderRadius: "8px",
      borderLeft: "3px solid #007aff",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: items.length > 0 ? "6px" : "0",
        fontWeight: 600,
        color: headerColor,
      }}>
        <span>TODOs</span>
        {totalCount > 0 && (
          <span style={{ fontSize: "11px", opacity: 0.5, fontWeight: 400 }}>
            {doneCount}/{totalCount}
          </span>
        )}
        <span style={{ fontSize: "11px", opacity: 0.35, fontWeight: 400, marginLeft: "4px" }}>
          {elapsed}
        </span>
        {isExecuting && (
          <span style={{ fontSize: "11px", opacity: 0.6, fontStyle: "italic", fontWeight: 400 }}>
            writing…
          </span>
        )}
        {onCancel && isExecuting && (
          <span
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            title="Cancel"
            style={{
              cursor: "pointer", fontSize: "12px", opacity: 0.5, lineHeight: 1,
              marginLeft: "auto", padding: "1px 4px", borderRadius: "3px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.06)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            ✕
          </span>
        )}
      </div>

      {items.map((item, idx) => (
        <div key={idx} style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "6px",
          padding: "3px 0",
          color: item.status === "completed" ? "#8e8e93" : "inherit",
          textDecoration: item.status === "completed" ? "line-through" : "none",
        }}>
          <span style={{
            color: statusColor[item.status] || "#8e8e93",
            flexShrink: 0,
            marginTop: "1px",
            fontSize: "13px",
          }}>
            {statusIcon[item.status] || "○"}
          </span>
          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {item.text}
          </span>
        </div>
      ))}

      {!isDone && items.length === 0 && (
        <div style={{ opacity: 0.5, fontSize: "11px" }}>
          <span>正在生成待办列表…</span>
        </div>
      )}
    </div>
  );
}
