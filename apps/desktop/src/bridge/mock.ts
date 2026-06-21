import { IBridge, UpdateResult, Session, Message, AgentEvent } from "./types";

const LOCAL_STORAGE_KEY = "bridge_mock_sessions";
const LOCAL_MESSAGES_KEY = "bridge_mock_messages";

function getLocalSessions(): Session[] {
  const data = localStorage.getItem(LOCAL_STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as Session[];
  } catch {
    return [];
  }
}

function saveLocalSessions(sessions: Session[]) {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(sessions));
}

function getLocalMessages(): Message[] {
  const data = localStorage.getItem(LOCAL_MESSAGES_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data) as Message[];
  } catch {
    return [];
  }
}

function saveLocalMessages(messages: Message[]) {
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
}

export const mockBridge: IBridge = {
  async greet(name: string): Promise<string> {
    console.warn(`[Bridge Mock] greet called with name: "${name}". Falling back to mock implementation.`);
    return `Hello, ${name}! You've been greeted from Browser Mock!`;
  },

  async checkForUpdates(): Promise<UpdateResult> {
    console.warn("[Bridge Mock] checkForUpdates called. Falling back to mock implementation.");
    return {
      hasUpdate: true,
      version: "0.3.0",
      changelog: "这是一个为网页端 Mock 环境模拟的升级包。\n- 新增：多项目（Projects）会话分组与管理。\n- 优化：在设置中原生文件夹路径选择器。\n- 修复：修复了一系列已知的 UI 交互问题。",
    };
  },

  async selectDirectory(): Promise<string | null> {
    console.warn("[Bridge Mock] selectDirectory called.");
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
      const path = window.prompt("请输入项目文件夹绝对路径:");
      return path ? path.trim() : null;
    }
    return "/mock/path";
  },

  async initDb(): Promise<void> {
    console.warn("[Bridge Mock] initDb called. Initializing mock localStorage database.");
    if (!localStorage.getItem(LOCAL_STORAGE_KEY)) {
      saveLocalSessions([]);
    }
    if (!localStorage.getItem(LOCAL_MESSAGES_KEY)) {
      saveLocalMessages([]);
    }
  },

  async saveSession(session: Session): Promise<void> {
    console.warn(`[Bridge Mock] saveSession called for ID: ${session.id}. Saving to localStorage.`);
    const sessions = getLocalSessions();
    const index = sessions.findIndex((s) => s.id === session.id);
    if (index > -1) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    // Sort by updatedAt DESC to match SQL order
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    saveLocalSessions(sessions);
  },

  async getSessions(): Promise<Session[]> {
    console.warn("[Bridge Mock] getSessions called. Fetching from localStorage.");
    return getLocalSessions();
  },

  async deleteSession(id: string): Promise<void> {
    console.warn(`[Bridge Mock] deleteSession called for ID: ${id}. Removing from localStorage.`);
    const sessions = getLocalSessions();
    const filtered = sessions.filter((s) => s.id !== id);
    saveLocalSessions(filtered);

    // Cascade delete messages
    const messages = getLocalMessages();
    const remainingMessages = messages.filter((m) => m.sessionId !== id);
    saveLocalMessages(remainingMessages);
  },

  async saveMessage(msg: Message): Promise<void> {
    console.warn(`[Bridge Mock] saveMessage called for ID: ${msg.id}. Saving to localStorage.`);
    const messages = getLocalMessages();
    const index = messages.findIndex((m) => m.id === msg.id);
    if (index > -1) {
      messages[index] = msg;
    } else {
      messages.push(msg);
    }
    saveLocalMessages(messages);
  },

  async getMessages(sessionId: string): Promise<Message[]> {
    console.warn(`[Bridge Mock] getMessages called for session ${sessionId}. Fetching from localStorage.`);
    const messages = getLocalMessages();
    return messages.filter((m) => m.sessionId === sessionId);
  },

  async getSetting(key: string): Promise<string | null> {
    console.warn(`[Bridge Mock] getSetting called for key: ${key}`);
    return localStorage.getItem(`bridge_mock_setting_${key}`);
  },

  async saveSetting(key: string, value: string): Promise<void> {
    console.warn(`[Bridge Mock] saveSetting called for key: ${key}`);
    localStorage.setItem(`bridge_mock_setting_${key}`, value);
  },

  async deleteSetting(key: string): Promise<void> {
    console.warn(`[Bridge Mock] deleteSetting called for key: ${key}`);
    localStorage.removeItem(`bridge_mock_setting_${key}`);
  },

  async runAgent(
    _apiKey: string,
    _model: string,
    _messages: any[],
    _workspaceRoot: string,
    _sessionId: string,
    _agentMode: string | undefined,
    onEvent: (event: AgentEvent) => void
  ): Promise<void> {
    console.warn(`[Bridge Mock] runAgent called. agentMode=${_agentMode || "default"} Simulating agent events.`);
    onEvent({ type: "ThinkingStarted", payload: null });
    onEvent({ type: "Thinking", payload: "Thinking: 正在扫描工作区..." });
    await new Promise((r) => setTimeout(r, 400));
    onEvent({ type: "ThinkingEnded", payload: null });

    onEvent({ type: "StepStarted", payload: null });
    onEvent({ type: "ToolCall", payload: { name: "Glob", args: JSON.stringify({ pattern: "**/*.tsx" }), callID: "call_1" } });
    onEvent({ type: "ToolStarted", payload: { callID: "call_1" } });
    await new Promise((r) => setTimeout(r, 400));
    onEvent({ type: "ToolSuccess", payload: { name: "Glob", result: JSON.stringify({ files: ["src/App.tsx", "src/main.tsx"] }), callID: "call_1" } });
    onEvent({ type: "ToolEnded", payload: { callID: "call_1" } });
    onEvent({ type: "StepEnded", payload: null });

    onEvent({ type: "ThinkingStarted", payload: null });
    onEvent({ type: "Thinking", payload: "Thinking: 已经找到 App.tsx，准备提供答复。" });
    await new Promise((r) => setTimeout(r, 400));
    onEvent({ type: "ThinkingEnded", payload: null });

    onEvent({ type: "TextStarted", payload: null });
    onEvent({ type: "Text", payload: "你好！这是来自浏览器 Mock 环境的模拟回复。\n\n" });
    onEvent({ type: "Text", payload: "在原生桌面端运行此应用时，我将加载真实的 6 大核心工具（FileRead, FileWrite, FileEdit, Grep, Glob, Bash）并代表您执行真实的任务。" });
    await new Promise((r) => setTimeout(r, 400));
    onEvent({ type: "TextEnded", payload: null });

    onEvent({ type: "Finished", payload: null });
  },

  async cancelAgent(): Promise<void> {
    console.warn("[Bridge Mock] cancelAgent called. No-op in mock environment.");
  },

  async listWorkspaceFiles(_maxResults = 200): Promise<string[]> {
    console.warn("[Bridge Mock] listWorkspaceFiles called. Returning mock files.");
    return [
      "src/App.tsx",
      "src/App.css",
      "src/main.tsx",
      "src/components/ChatInput.tsx",
      "src/components/ChatFeed.tsx",
      "src/components/ToolCallCard.tsx",
      "src/components/RightPanel.tsx",
      "src/components/EmptyState.tsx",
      "src/components/LeftSidebar.tsx",
      "src/components/TitleBar.tsx",
      "src/components/SettingsModal.tsx",
      "src/bridge/types.ts",
      "src/bridge/tauri.ts",
      "src/bridge/mock.ts",
      "src/bridge/index.ts",
      "src/utils/markdown.tsx",
      "src-tauri/src/lib.rs",
      "src-tauri/Cargo.toml",
      "src-sidecar/index.ts",
      "README.md",
      "package.json",
      "tsconfig.json",
    ];
  },

  async readFile(_relativePath: string): Promise<string> {
    console.warn(`[Bridge Mock] readFile called for: ${_relativePath}`);
    if (_relativePath.endsWith(".tsx") || _relativePath.endsWith(".ts")) {
      return `// Mock content for ${_relativePath}\n// 这是模拟文件内容，用于浏览器开发测试\n\nimport React from "react";\n\nexport default function MockComponent() {\n  return <div>Mock Content</div>;\n}\n`;
    }
    if (_relativePath.endsWith(".rs")) {
      return `// Mock Rust content for ${_relativePath}\n\nfn main() {\n    println!("Hello from mock!");\n}\n`;
    }
    if (_relativePath.endsWith(".md")) {
      return `# Mock README\n\n这是为浏览器开发环境生成的模拟内容。\n`;
    }
    if (_relativePath.endsWith(".json")) {
      return `{\n  "name": "mock-package",\n  "version": "1.0.0"\n}\n`;
    }
    if (_relativePath.endsWith(".css")) {
      return `/* Mock CSS for ${_relativePath} */\n\n.mock-container {\n  display: flex;\n  padding: 16px;\n}\n`;
    }
    return `// Mock file: ${_relativePath}\n// （无特定模拟内容）\n`;
  },

  async getFileUrl(_relativePath: string): Promise<string> {
    console.warn(`[Bridge Mock] getFileUrl called for: ${_relativePath}`);
    // 返回一个模拟的占位图片（SVG data URL）
    const ext = _relativePath.split(".").pop()?.toLowerCase() || "png";
    const label = ext.toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f0f0f5" rx="8"/>
  <text x="200" y="130" text-anchor="middle" font-family="system-ui,sans-serif" font-size="40">🖼️</text>
  <text x="200" y="170" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" fill="#8e8e93">${_relativePath}</text>
  <text x="200" y="190" text-anchor="middle" font-family="system-ui,sans-serif" font-size="11" fill="#aeaeb2">${label} · Mock 预览</text>
</svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  },
};

