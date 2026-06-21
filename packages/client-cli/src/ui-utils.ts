/**
 * CLI UI 工具函数
 * 仿 Claude Code 终端风格的工具调用展示和进度仪表盘
 */

// ─── 动画 ───────────────────────────────────────
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spinnerIdx = 0;

export function spinner() {
  const frame = SPINNER_FRAMES[_spinnerIdx];
  _spinnerIdx = (_spinnerIdx + 1) % SPINNER_FRAMES.length;
  return frame;
}

// ─── 格式化 ─────────────────────────────────────
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** 截断参数到指定宽度，用于工具调用行显示 */
export function truncateArgs(args: string, maxLen = 60): string {
  let str = typeof args === 'string' ? args : JSON.stringify(args);
  // 尝试从 JSON 中提取关键字段
  try {
    const parsed = JSON.parse(str);
    str = parsed.command || parsed.description || parsed.pattern || parsed.path || str;
  } catch {}
  str = String(str);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

// ─── 工具调用行 ─────────────────────────────────
/**
 * 渲染一行工具调用（仿 Claude Code 终端风格）
 *
 * 示例输出:
 *   ◇  bash "git log -10"                                               0.3s
 *   ✓  bash "git log -10"                                               0.3s
 *   ✗  bash "git log -10"                                               Error: ...
 *
 * @param icon      ◇ / ✓ / ✗
 * @param toolName  工具名 (bash, read, write, grep, glob 等)
 * @param args      参数字符串
 * @param duration  耗时，如 "0.3s" 或 "运行中"
 * @param error     错误信息（仅 ✗ 时）
 */
export function renderToolLine(
  icon: string,
  toolName: string,
  args: string,
  duration: string,
  error?: string,
): string {
  const indent = '  ';
  const name = toolName.padEnd(8);
  const argsStr = truncateArgs(args);
  // 最小宽度保证对齐
  const line = `${indent}${icon}  ${name}${argsStr}`;
  const right = error ? ` ${error}` : ` ${duration}`;
  return line + right;
}

// ─── 底部状态栏 ─────────────────────────────────
const STATUS_BAR_WIDTH = 60;

interface StatusBarState {
  step: number;        // 当前步骤（从 1 开始）
  totalSteps: number;  // 总步骤数
  label: string;       // 当前步骤标签，如 "Agent 执行代码开发"
  currentTool?: string; // 当前执行中的工具名
  currentToolDuration?: string; // 当前工具已运行时间
  model?: string;      // 模型名
  elapsed: string;     // 已运行时间，如 "01:23"
}

export function renderStatusBar(state: StatusBarState): string {
  const spin = spinner();
  const stepStr = `步骤 ${state.step}/${state.totalSteps}`;
  const timeStr = state.elapsed;

  const lines: string[] = [];

  // 顶部分隔线
  lines.push(`┌─ OpenHands Pipeline ${'─'.repeat(Math.max(0, STATUS_BAR_WIDTH - 22))} ${timeStr} ─┐`);

  // 步骤 + 标签
  const stepLine = `│ ${spin} ${stepStr}: ${state.label}`;
  lines.push(stepLine + ' '.repeat(Math.max(0, STATUS_BAR_WIDTH + 7 - stepLine.length + 1)) + '│');

  // 当前工具
  if (state.currentTool) {
    const dur = state.currentToolDuration || '';
    const toolLine = `│   当前: ${state.currentTool}${dur ? ` (${dur})` : ''}`;
    lines.push(toolLine + ' '.repeat(Math.max(0, STATUS_BAR_WIDTH + 7 - toolLine.length + 1)) + '│');
  }

  // 模型
  if (state.model) {
    const modelLine = `│   模型: ${state.model}`;
    lines.push(modelLine + ' '.repeat(Math.max(0, STATUS_BAR_WIDTH + 7 - modelLine.length + 1)) + '│');
  }

  // 底部分隔线
  lines.push(`└${'─'.repeat(STATUS_BAR_WIDTH + 6)}┘`);

  return lines.join('\n');
}

/** 清除状态栏（回到终端底部） */
export function clearStatusBar(lineCount: number): string {
  // ANSI 上移 + 清除行
  return `\x1b[${lineCount}A` + '\x1b[J';
}
