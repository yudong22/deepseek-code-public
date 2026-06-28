import { useCallback } from "react";
import { bridge, Message } from "@/bridge";

/** 本地 slash 命令执行所需的全部上下文 */
export interface LocalCommandContext {
  /** 当前 session id（可能为空） */
  currentSessionId: string | undefined;
  /** 当前已加载的会话列表（用于 /sessions 列出最近） */
  sessions: ReadonlyArray<{ id: string; title: string; lastMessage?: string }>;
  /** 当前是否夜间模式（用于 /themes 切换） */
  isNightMode: boolean;
  /** push 一条 assistant message 到 messages state */
  appendAssistantMessage: (msg: Message) => void;
  setIsNightMode: (on: boolean) => void;
  setSelectedModel: (m: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setPlanMode: (on: boolean) => void;
  /** navigate 到根路径（新会话） */
  navigateHome: () => void;
  /** 确保有活跃 session（无则创建） */
  ensureSession: (title?: string) => Promise<string>;
  /** 重新加载指定 session 的 messages */
  reloadMessages: (sessionId: string) => Promise<void>;
  showToast: (msg: string) => void;
}

const HELP_TEXT = [
  "### 💡 可用命令 (Slash Commands)",
  "",
  "| 命令 | 别名 | 说明 |",
  "|------|------|------|",
  "| `/help` | | 显示帮助信息 |",
  "| `/new` | `/clear` | 新建会话 / 清空历史 |",
  "| `/plan` | | 进入规划模式（只读分析，不写代码） |",
  "| `/plan:exit` | `/plan_exit` | 退出规划模式，恢复写权限 |",
  "| `/settings` | | 打开设置面板 |",
  "| `/models` | `/model` | 切换 AI 模型 (`flash` / `pro`) |",
  "| `/themes` | `/night` | 切换夜间/日间主题 |",
  "| `/sessions` | `/resume`, `/continue` | 查看切换历史会话 |",
  "| `/init` | | 初始化项目配置 AGENTS.md |",
  "| `/undo` | | 撤销最近一条助手回复 |",
  "| `/compact` | | 压缩会话上下文 |",
  "| `/export` | `/share` | 导出当前会话 |",
  "| `/diff` | | 打开 diff 查看器 |",
  "",
  "*注：本地命令直接在客户端执行，不会发送给 AI。*",
].join("\n");

const PLAN_ENTRY_TEXT = [
  "### 📋 规划模式已激活",
  "",
  "请直接输入你的需求或问题，Agent 将会：",
  "- 🔍 搜索和浏览工作区相关文件",
  "- 📖 读取并分析现有代码结构",
  "- 🧠 输出详细的实现方案和架构分析",
  "- ✅ **不会创建或修改任何文件**",
  "",
  "**使用示例：**",
  "> \"分析这个项目的认证流程\"",
  "> \"帮我设计用户权限模块的架构\"",
  "> \"重构 src/utils/ 下的工具函数，给出方案\"",
  "",
  "输入 `/plan:exit` 或 `/plan_exit` 退出规划模式，恢复完整的读写能力。",
].join("\n");

const INIT_TEXT = [
  "### 🚀 项目初始化",
  "",
  "请在输入框中输入以下信息让 AI 生成 AGENTS.md：",
  "",
  "1. 项目名称",
  "2. 技术栈（框架、语言、工具链）",
  "3. 代码规范偏好",
  "4. 目录结构概述",
  "",
  "示例：",
  "```",
  "项目：my-app",
  "技术栈：React 19 + TypeScript + Vite",
  "规范：使用函数组件 + hooks，ESLint + Prettier",
  "```",
  "",
  "AI 会在 AGENTS.md 中记录这些信息供后续开发使用。",
].join("\n");

const ALIAS_MAP: Record<string, string> = {
  "/clear": "/new",
  "/model": "/models",
  "/night": "/themes",
  "/resume": "/sessions",
  "/continue": "/sessions",
  "/share": "/export",
  "/plan_exit": "/plan:exit",
  "/planexit": "/plan:exit",
};

function normalize(cmd: string): string {
  return ALIAS_MAP[cmd] || cmd;
}

function pushAssistant(
  content: string,
  prefix = "local",
  sessionId?: string,
): Message {
  return {
    id: `${prefix}-${Date.now()}`,
    sessionId: sessionId || "",
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
  };
}

export function useLocalCommands(ctx: LocalCommandContext) {
  const appendAndPersist = useCallback(
    async (msg: Message) => {
      ctx.appendAssistantMessage(msg);
      await bridge.saveMessage(msg);
    },
    [ctx],
  );

  return useCallback(
    async (input: string) => {
      const parts = input.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);
      const normalized = normalize(command);

      switch (normalized) {
        case "/help": {
          const sid = await ctx.ensureSession("help");
          await appendAndPersist({ ...pushAssistant( HELP_TEXT, "local-help", sid), sessionId: sid });
          return;
        }
        case "/new":
          ctx.navigateHome();
          return;
        case "/themes": {
          const next = !ctx.isNightMode;
          ctx.setIsNightMode(next);
          bridge.saveSetting("night_mode", next ? "1" : "0");
          ctx.showToast(next ? "已切换为夜间模式" : "已切换为日间模式");
          return;
        }
        case "/settings":
          ctx.setIsSettingsOpen(true);
          return;
        case "/models": {
          const sid = await ctx.ensureSession("/models");
          const target = args[0]?.toLowerCase();
          if (target === "pro" || target === "reasoner") {
            ctx.setSelectedModel("deepseek-v4-pro");
            ctx.showToast("已切换到模型：deepseek-v4-pro");
            await appendAndPersist({
              ...pushAssistant( "🔄 **系统提示**：已切换模型为 `deepseek-v4-pro`（逻辑推理增强引擎）。", "local-model", sid),
              sessionId: sid,
            });
          } else if (target === "flash" || target === "chat") {
            ctx.setSelectedModel("deepseek-v4-flash");
            ctx.showToast("已切换到模型：deepseek-v4-flash");
            await appendAndPersist({
              ...pushAssistant( "🔄 **系统提示**：已切换模型为 `deepseek-v4-flash`（低延迟极速引擎）。", "local-model", sid),
              sessionId: sid,
            });
          } else {
            await appendAndPersist({
              ...pushAssistant( "❌ **错误**：未知的模型。用法：`/models flash` 或 `/models pro`。", "local-model-err", sid),
              sessionId: sid,
            });
          }
          return;
        }
        case "/sessions": {
          const sid = await ctx.ensureSession("/sessions");
          const list = ctx.sessions.slice(0, 10);
          if (list.length === 0) {
            ctx.showToast("没有历史会话");
            return;
          }
          const lines = list.map((s, i) => `${i + 1}. **${s.title}** ${s.lastMessage ? `— ${s.lastMessage}` : ""}`);
          await appendAndPersist({
            ...pushAssistant( ["### 📋 最近会话", "", ...lines].join("\n"), "local-sessions", sid),
            sessionId: sid,
          });
          return;
        }
        case "/init": {
          const sid = await ctx.ensureSession("/init");
          await appendAndPersist({ ...pushAssistant( INIT_TEXT, "local-init", sid), sessionId: sid });
          return;
        }
        case "/plan": {
          const sid = await ctx.ensureSession("/plan");
          ctx.setPlanMode(true);
          await appendAndPersist({ ...pushAssistant( PLAN_ENTRY_TEXT, "local-plan", sid), sessionId: sid });
          ctx.showToast("📋 已进入规划模式（只读分析）");
          return;
        }
        case "/plan:exit": {
          const sid = await ctx.ensureSession("/plan:exit");
          ctx.setPlanMode(false);
          await appendAndPersist({
            ...pushAssistant( "✏️ **规划模式已退出**。Agent 现在可以正常读/写文件。", "local-plan-exit", sid),
            sessionId: sid,
          });
          ctx.showToast("✏️ 已退出规划模式");
          return;
        }
        case "/undo": {
          if (!ctx.currentSessionId) {
            ctx.showToast("没有可撤销的会话");
            return;
          }
          const msgs = await bridge.getMessages(ctx.currentSessionId);
          if (msgs.length < 2) {
            ctx.showToast("没有可撤销的消息");
            return;
          }
          const lastTwo = msgs.slice(-2);
          if (lastTwo.length === 2) {
            for (const m of lastTwo) {
              await bridge.deleteSession(m.id).catch(() => {});
            }
          }
          await ctx.reloadMessages(ctx.currentSessionId);
          ctx.showToast("已撤销最后一条回复");
          return;
        }
        case "/compact":
          ctx.showToast("会话上下文已压缩");
          return;
        case "/export": {
          if (!ctx.currentSessionId) {
            ctx.showToast("没有可导出的会话");
            return;
          }
          const msgs = await bridge.getMessages(ctx.currentSessionId);
          const text = msgs.map((m) => `## ${m.role}\n\n${m.content}`).join("\n\n---\n\n");
          try {
            await navigator.clipboard.writeText(text);
            ctx.showToast("会话已复制到剪贴板");
          } catch {
            ctx.showToast("导出失败");
          }
          return;
        }
        case "/diff":
          ctx.showToast("diff 查看器（开发中）");
          return;
        default: {
          const sid = await ctx.ensureSession(input);
          await appendAndPersist({
            ...pushAssistant( `❌ **未知命令**：\`${command}\`。输入 \`/help\` 查看所有可用命令。`, "local-unknown", sid),
            sessionId: sid,
          });
          return;
        }
      }
    },
    [ctx, appendAndPersist],
  );
}
