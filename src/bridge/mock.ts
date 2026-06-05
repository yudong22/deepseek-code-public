import { IBridge, UpdateResult, Session, Message } from "./types";

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
      version: "1.0.0",
      changelog: "This is a mock update changelog for browser environment test.",
    };
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
};
