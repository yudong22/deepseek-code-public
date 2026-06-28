interface SlashCommand {
  name: string;
  aliases: string[];
  description: string;
  icon: string;
}

interface SlashAutocompleteProps {
  visible: boolean;
  commands: SlashCommand[];
  query: string;
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
}

const COMMANDS_LIST: SlashCommand[] = [
  { name: "help", aliases: [], description: "显示帮助信息", icon: "💡" },
  { name: "new", aliases: ["clear"], description: "新建会话 / 清空历史", icon: "✨" },
  { name: "plan", aliases: [], description: "进入规划模式（只读分析，不写代码）", icon: "📋" },
  { name: "plan:exit", aliases: ["plan_exit"], description: "退出规划模式，恢复写权限", icon: "✏️" },
  { name: "settings", aliases: [], description: "打开设置面板", icon: "⚙️" },
  { name: "models", aliases: ["model"], description: "切换 AI 模型 (flash|pro)", icon: "🧠" },
  { name: "themes", aliases: ["night"], description: "切换夜间/日间主题", icon: "🎨" },
  { name: "sessions", aliases: ["resume", "continue"], description: "查看切换历史会话", icon: "📋" },
  { name: "init", aliases: [], description: "初始化项目配置 AGENTS.md", icon: "🚀" },
  { name: "undo", aliases: [], description: "撤销最近一条助手回复", icon: "↩️" },
  { name: "compact", aliases: [], description: "压缩会话上下文", icon: "📦" },
  { name: "export", aliases: ["share"], description: "导出当前会话", icon: "📤" },
  { name: "diff", aliases: [], description: "打开 diff 查看器", icon: "📊" },
];

/** 根据输入文本搜索过滤命令 */
export function filterSlashCommands(query: string): SlashCommand[] {
  if (!query) return COMMANDS_LIST;
  const q = query.toLowerCase();
  return COMMANDS_LIST.filter(
    (c) =>
      c.name.includes(q) ||
      c.aliases.some((a) => a.includes(q)) ||
      c.description.toLowerCase().includes(q)
  ).slice(0, 12);
}

export function getSlashCommands(): SlashCommand[] {
  return COMMANDS_LIST;
}

export default function SlashAutocomplete({
  visible,
  commands,
  query: _query,
  selectedIndex,
  onSelect,
  onDismiss: _onDismiss,
}: SlashAutocompleteProps) {
  if (!visible || commands.length === 0) return null;

  return (
    <div className="slash-autocomplete-dropdown" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
      {commands.map((cmd, idx) => (
        <div
          key={cmd.name}
          className={`file-autocomplete-item ${idx === selectedIndex ? "active" : ""}`}
          onClick={() => onSelect(cmd)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            padding: "5px 10px",
            fontSize: "12px",
            fontFamily: 'system-ui, -apple-system, sans-serif',
            cursor: "pointer",
            borderRadius: "4px",
            color: idx === selectedIndex ? "#fff" : "inherit",
            background: idx === selectedIndex ? "var(--dsw-static-deepseek-500)" : "transparent",
          }}
        >
          <span style={{ fontSize: "13px", flexShrink: 0 }}>{cmd.icon}</span>
          <span style={{ fontWeight: 600, flexShrink: 0, marginRight: "2px" }}>/{cmd.name}</span>
          <span style={{
            color: "#aeaeb2",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {cmd.description}
          </span>
        </div>
      ))}
    </div>
  );
}
