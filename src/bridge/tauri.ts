import { invoke, Channel } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { IBridge, UpdateResult, Session, Message, AgentEvent } from "./types";

let dbInstance: Database | null = null;

async function getDb(): Promise<Database> {
  if (!dbInstance) {
    dbInstance = await Database.load("sqlite:deepseek_code.db");
  }
  return dbInstance;
}

export const tauriBridge: IBridge = {
  async greet(name: string): Promise<string> {
    try {
      return await invoke<string>("greet", { name });
    } catch (error) {
      console.error("Tauri greet invocation failed:", error);
      return `Error: Failed to greet from native backend.`;
    }
  },

  async checkForUpdates(): Promise<UpdateResult> {
    console.log("Tauri: checking for updates...");
    // 占位实现，后续可以调用 @tauri-apps/plugin-updater 插件
    return {
      hasUpdate: false,
    };
  },

  async initDb(): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          lastMessage TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          projectName TEXT
        );
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          sessionId TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt TEXT NOT NULL,
          reasoningContent TEXT,
          filesChanged TEXT,
          artifacts TEXT,
          toolCalls TEXT
        );
      `);
      try {
        await db.execute("ALTER TABLE messages ADD COLUMN reasoningContent TEXT");
      } catch (e) {
        // column may already exist
      }
      try {
        await db.execute("ALTER TABLE messages ADD COLUMN toolCalls TEXT");
      } catch (e) {
        // column may already exist
      }
      await db.execute(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      console.log("Tauri SQLite database tables initialized successfully.");
    } catch (error) {
      console.error("Failed to initialize SQLite database:", error);
      throw error;
    }
  },

  async saveSession(session: Session): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO sessions (id, title, lastMessage, updatedAt, projectName) VALUES (?, ?, ?, ?, ?)",
        [session.id, session.title, session.lastMessage, session.updatedAt, session.projectName || null]
      );
    } catch (error) {
      console.error(`Failed to save session ${session.id}:`, error);
      throw error;
    }
  },

  async getSessions(): Promise<Session[]> {
    try {
      const db = await getDb();
      return await db.select<Session[]>(
        "SELECT id, title, lastMessage, updatedAt, projectName FROM sessions ORDER BY updatedAt DESC"
      );
    } catch (error) {
      console.error("Failed to retrieve sessions from SQLite:", error);
      return [];
    }
  },

  async deleteSession(id: string): Promise<void> {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM sessions WHERE id = ?", [id]);
      await db.execute("DELETE FROM messages WHERE sessionId = ?", [id]);
    } catch (error) {
      console.error(`Failed to delete session ${id}:`, error);
      throw error;
    }
  },

  async saveMessage(msg: Message): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO messages (id, sessionId, role, content, createdAt, reasoningContent, filesChanged, artifacts, toolCalls) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          msg.id,
          msg.sessionId,
          msg.role,
          msg.content,
          msg.createdAt,
          msg.reasoning_content || null,
          msg.filesChanged ? JSON.stringify(msg.filesChanged) : null,
          msg.artifacts ? JSON.stringify(msg.artifacts) : null,
          msg.toolCalls ? JSON.stringify(msg.toolCalls) : null,
        ]
      );
    } catch (error) {
      console.error(`Failed to save message ${msg.id}:`, error);
      throw error;
    }
  },

  async getMessages(sessionId: string): Promise<Message[]> {
    try {
      const db = await getDb();
      interface DbMessage {
        id: string;
        sessionId: string;
        role: "user" | "assistant" | "tool";
        content: string;
        createdAt: string;
        reasoningContent: string | null;
        filesChanged: string | null;
        artifacts: string | null;
        toolCalls: string | null;
      }
      const rows = await db.select<DbMessage[]>(
        "SELECT id, sessionId, role, content, createdAt, reasoningContent, filesChanged, artifacts, toolCalls FROM messages WHERE sessionId = ? ORDER BY createdAt ASC",
        [sessionId]
      );
      return rows.map((row) => ({
        id: row.id,
        sessionId: row.sessionId,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt,
        reasoning_content: row.reasoningContent || undefined,
        filesChanged: row.filesChanged ? JSON.parse(row.filesChanged) : undefined,
        artifacts: row.artifacts ? JSON.parse(row.artifacts) : undefined,
        toolCalls: row.toolCalls ? JSON.parse(row.toolCalls) : undefined,
      }));
    } catch (error) {
      console.error(`Failed to retrieve messages for session ${sessionId}:`, error);
      return [];
    }
  },

  async getSetting(key: string): Promise<string | null> {
    try {
      const db = await getDb();
      interface DbSetting {
        key: string;
        value: string;
      }
      const rows = await db.select<DbSetting[]>(
        "SELECT value FROM settings WHERE key = ?",
        [key]
      );
      if (rows && rows.length > 0) {
        return rows[0].value;
      }
      return null;
    } catch (error) {
      console.error(`Failed to retrieve setting for key ${key}:`, error);
      return null;
    }
  },

  async saveSetting(key: string, value: string): Promise<void> {
    try {
      const db = await getDb();
      await db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        [key, value]
      );
    } catch (error) {
      console.error(`Failed to save setting ${key}:`, error);
      throw error;
    }
  },

  async deleteSetting(key: string): Promise<void> {
    try {
      const db = await getDb();
      await db.execute("DELETE FROM settings WHERE key = ?", [key]);
    } catch (error) {
      console.error(`Failed to delete setting ${key}:`, error);
      throw error;
    }
  },

  async runAgent(
    apiKey: string,
    model: string,
    messages: any[],
    workspaceRoot: string,
    onEvent: (event: AgentEvent) => void
  ): Promise<void> {
    try {
      const channel = new Channel<AgentEvent>();
      channel.onmessage = (event: AgentEvent) => {
        onEvent(event);
      };
      await invoke("run_agent_loop", {
        apiKey,
        model,
        messages,
        workspaceRoot,
        onEvent: channel,
      });
    } catch (error) {
      console.error("Tauri runAgent invocation failed:", error);
      throw error;
    }
  },
};

