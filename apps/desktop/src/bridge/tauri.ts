import { invoke, Channel } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { ask } from "@tauri-apps/plugin-dialog";
import { IBridge, UpdateResult, UpdateStatus, Session, Message, AgentEvent, ScheduledTask } from "./types";
import { version as appVersion } from "../../package.json";

let dbInstance: Database | null = null;

// v0.5.2: 持有已下载但未确认安装的 Update 对象，供 installDownloadedUpdate() 二次消费。
// null 表示当前没有待安装的更新。
let pendingUpdate: Update | null = null;

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
    try {
      // 使用 /releases 列表接口（包含 prerelease），/latest 在仅有 prerelease 时返回 404
      const res = await fetch("https://api.github.com/repos/yudong22/deepseek-code-public/releases?per_page=1");
      if (res.ok) {
        const releases = await res.json();
        if (Array.isArray(releases) && releases.length > 0) {
          const latest = releases[0];
          // 跳过 draft 版本
          if (latest.draft) {
            return { hasUpdate: false };
          }
          const latestVersion = latest.tag_name?.replace(/^v/, "");
          const currentVersion = appVersion;
          if (latestVersion && latestVersion !== currentVersion) {
            return {
              hasUpdate: true,
              version: latestVersion,
              changelog: latest.body || "无更新说明。",
            };
          }
        }
      }
    } catch (error) {
      console.error("Tauri checkForUpdates failed:", error);
    }
    return {
      hasUpdate: false,
    };
  },

  async installUpdate(onStatus?: (status: UpdateStatus) => void): Promise<void> {
    try {
      onStatus?.({ status: "checking" });
      let update: Update | null;
      try {
        update = await check();
      } catch (e: any) {
        // 签名无效（如 update.json 的 signature 为空）时 check() 会抛编码异常
        // 指引用户前往 GitHub 手动下载
        onStatus?.({ status: "error", error: `自动更新元数据验证失败 (${e.message || '签名无效'})，请前往 GitHub Releases 手动下载: https://github.com/yudong22/deepseek-code-public/releases` });
        return;
      }
      if (!update) {
        onStatus?.({ status: "error", error: "没有可用的更新，请前往 GitHub Releases 手动下载: https://github.com/yudong22/deepseek-code-public/releases" });
        return;
      }

      pendingUpdate = update;
      const newVersion = update.version;
      onStatus?.({ status: "downloading", version: newVersion, progress: 0 });

      // Tauri v2.10 的 Progress 事件仅暴露 chunkLength（无总长），用累加估算百分比
      let lastProgress = 0;
      await update.download((event) => {
        if (event.event === "Finished") {
          onStatus?.({ status: "downloading", version: newVersion, progress: 99 });
          onStatus?.({ status: "downloaded", version: newVersion, progress: 100 });
        } else if (event.event === "Progress") {
          lastProgress = Math.min(99, lastProgress + 5);
          onStatus?.({ status: "downloading", version: newVersion, progress: lastProgress });
        }
      });

      // v0.5.2: 下载完成。等待用户通过 confirmUpdateInstall() + installDownloadedUpdate() 决定下一步。
      // 这里**不**调用 update.install() 也不 relaunch。
    } catch (error: any) {
      console.error("Tauri installUpdate failed:", error);
      pendingUpdate = null;
      const msg = error.message || String(error);
      // 签名无效时引导用户手动下载
      if (msg.includes("minisign") || msg.includes("signature") || msg.includes("sign")) {
        onStatus?.({ status: "error", error: `自动更新签名验证失败，请前往 GitHub Releases 手动下载最新版本: https://github.com/yudong22/deepseek-code-public/releases` });
      } else {
        onStatus?.({ status: "error", error: msg });
      }
    }
  },

  async confirmUpdateInstall(version: string): Promise<boolean> {
    try {
      const ok = await ask(
        `新版本 v${version} 已下载完成，是否立即重启应用以应用更新？\n\n（您也可以选择"稍后"，下次手动重启或再次检查更新时生效。）`,
        { title: "更新已就绪", kind: "info", okLabel: "立即重启", cancelLabel: "稍后" }
      );
      return ok;
    } catch (e) {
      // Mock/非 Tauri 环境 fallback 到 window.confirm
      if (typeof window !== "undefined" && typeof window.confirm === "function") {
        return window.confirm(`新版本 v${version} 已下载完成，是否立即重启应用以应用更新？`);
      }
      return false;
    }
  },

  async installDownloadedUpdate(): Promise<void> {
    const update = pendingUpdate;
    if (!update) {
      throw new Error("没有可安装的更新，请先调用 installUpdate。");
    }
    try {
      await update.install();
      await relaunch();
    } finally {
      pendingUpdate = null;
    }
  },

  async selectDirectory(): Promise<string | null> {
    try {
      return await invoke<string | null>("select_directory");
    } catch (error) {
      console.error("Tauri selectDirectory failed:", error);
      return null;
    }
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
      try {
        await db.execute("ALTER TABLE messages ADD COLUMN sections TEXT");
      } catch (e) {
        // column may already exist
      }
      try {
        await db.execute("ALTER TABLE messages ADD COLUMN completedAt TEXT");
      } catch (e) {
        // column may already exist
      }
      try {
        await db.execute("ALTER TABLE messages ADD COLUMN elapsed TEXT");
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
      const rows = await db.select<any[]>(
        "SELECT id, title, lastMessage, updatedAt, projectName FROM sessions ORDER BY updatedAt DESC"
      );
      return rows.map((row) => {
        const lastMsg = row.lastMessage !== undefined ? row.lastMessage : row.lastmessage;
        const updated = row.updatedAt !== undefined ? row.updatedAt : row.updatedat;
        const project = row.projectName !== undefined ? row.projectName : row.projectname;
        return {
          id: row.id,
          title: row.title,
          lastMessage: lastMsg || "",
          updatedAt: updated || "",
          projectName: project || undefined,
        };
      });
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
        "INSERT OR REPLACE INTO messages (id, sessionId, role, content, createdAt, reasoningContent, filesChanged, artifacts, toolCalls, sections, completedAt, elapsed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
          msg.sections ? JSON.stringify(msg.sections) : null,
          msg.completedAt || null,
          msg.elapsed || null,
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
      const rows = await db.select<any[]>(
        "SELECT id, sessionId, role, content, createdAt, reasoningContent, filesChanged, artifacts, toolCalls, sections, completedAt, elapsed FROM messages WHERE sessionId = ? ORDER BY createdAt ASC",
        [sessionId]
      );
      return rows.map((row) => {
        const sessId = row.sessionId !== undefined ? row.sessionId : row.sessionid;
        const created = row.createdAt !== undefined ? row.createdAt : row.createdat;
        const reasoning = row.reasoningContent !== undefined ? row.reasoningContent : row.reasoningcontent;
        const files = row.filesChanged !== undefined ? row.filesChanged : row.fileschanged;
        const arts = row.artifacts !== undefined ? row.artifacts : row.artifacts; // note: row.artifacts is already lowercase but added for symmetry
        const tCalls = row.toolCalls !== undefined ? row.toolCalls : row.toolcalls;
        const sec = row.sections !== undefined ? row.sections : row.sections;
        const comp = row.completedAt !== undefined ? row.completedAt : row.completedat;
        const elap = row.elapsed !== undefined ? row.elapsed : row.elapsed;

        return {
          id: row.id,
          sessionId: sessId,
          role: row.role,
          content: row.content,
          createdAt: created,
          reasoning_content: reasoning || undefined,
          filesChanged: files ? JSON.parse(files) : undefined,
          artifacts: arts ? JSON.parse(arts) : undefined,
          toolCalls: tCalls ? JSON.parse(tCalls) : undefined,
          sections: sec ? JSON.parse(sec) : undefined,
          completedAt: comp || undefined,
          elapsed: elap || undefined,
        };
      });
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
    sessionId: string,
    agentMode: string | undefined,
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
        sessionId,
        agentMode: agentMode || null,
        onEvent: channel,
      });
    } catch (error) {
      console.error("Tauri runAgent invocation failed:", error);
      throw error;
    }
  },

  async cancelAgent(): Promise<void> {
    try {
      await invoke("cancel_agent");
    } catch (error) {
      console.error("Tauri cancelAgent failed:", error);
    }
  },

  async respondToAgent(answer: string): Promise<void> {
    try {
      await invoke("respond_to_agent", { answer });
    } catch (error) {
      console.error("Tauri respondToAgent failed:", error);
    }
  },

  async listWorkspaceFiles(maxResults = 200): Promise<string[]> {
    try {
      const db = await getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = ?",
        ["workspace_path"]
      );
      const workspaceRoot = rows?.[0]?.value || "";
      return await invoke<string[]>("list_workspace_files", {
        workspaceRoot,
        maxResults,
      });
    } catch (error) {
      console.error("Failed to list workspace files:", error);
      return [];
    }
  },

  async readFile(relativePath: string): Promise<string> {
    try {
      const db = await getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = ?",
        ["workspace_path"]
      );
      const workspaceRoot = rows?.[0]?.value || "";
      return await invoke<string>("read_text_file", {
        workspaceRoot,
        relativePath,
      });
    } catch (error) {
      console.error(`Failed to read file ${relativePath}:`, error);
      return `Error: ${error}`;
    }
  },

  async getFileUrl(relativePath: string): Promise<string> {
    try {
      const db = await getDb();
      const rows = await db.select<{ value: string }[]>(
        "SELECT value FROM settings WHERE key = ?",
        ["workspace_path"]
      );
      const workspaceRoot = rows?.[0]?.value || "";
      const base64 = await invoke<string>("read_file_base64", {
        workspaceRoot,
        relativePath,
      });
      // 根据扩展名确定 MIME 类型
      const ext = relativePath.split(".").pop()?.toLowerCase() || "";
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        svg: "image/svg+xml",
        webp: "image/webp",
        bmp: "image/bmp",
        ico: "image/x-icon",
      };
      const mime = mimeMap[ext] || "application/octet-stream";
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      console.error(`Failed to get file URL for ${relativePath}:`, error);
      return "";
    }
  },

  // ── v0.5.8 Scheduled Tasks ──

  async listScheduledTasks(): Promise<ScheduledTask[]> {
    return await invoke<ScheduledTask[]>("list_scheduled_tasks");
  },

  async createScheduledTask(task: ScheduledTask): Promise<void> {
    await invoke("create_scheduled_task", { task });
  },

  async updateScheduledTask(task: ScheduledTask): Promise<void> {
    await invoke("update_scheduled_task", { task });
  },

  async deleteScheduledTask(id: string): Promise<void> {
    await invoke("delete_scheduled_task", { id });
  },

  async toggleScheduledTask(id: string, enabled: boolean): Promise<void> {
    await invoke("toggle_scheduled_task", { id, enabled });
  },
};

