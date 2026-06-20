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
    onEvent: (event: AgentEvent) => void
  ): Promise<void> {
    console.warn("[Bridge Mock] runAgent called. Simulating agent events.");
    onEvent({ type: "ThinkingStarted", payload: null });
    onEvent({ type: "Thinking", payload: "Thinking: 正在扫描工作区..." });
    await new Promise((r) => setTimeout(r, 400));
    onEvent({ type: "ThinkingEnded", payload: null });

    onEvent({ type: "ToolCall", payload: { name: "Glob", args: JSON.stringify({ pattern: "**/*.tsx" }), callID: "call_1" } });
    onEvent({ type: "ToolStarted", payload: { callID: "call_1" } });
    await new Promise((r) => setTimeout(r, 400));
    onEvent({ type: "ToolSuccess", payload: { name: "Glob", result: JSON.stringify({ files: ["src/App.tsx", "src/main.tsx"] }), callID: "call_1" } });
    onEvent({ type: "ToolEnded", payload: { callID: "call_1" } });

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
};

