import { describe, expect, test, beforeEach } from "bun:test";
import { isTauriEnv } from "./index";
import { mockBridge } from "./mock";
import { Session, Message } from "./types";

// --- Mock localStorage for CLI Test Environment ---
if (typeof globalThis.localStorage === "undefined") {
  const store: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k in store) delete store[k];
    },
    key: (index: number) => Object.keys(store)[index] || null,
    length: 0,
  };
  Object.defineProperty(globalThis.localStorage, "length", {
    get: () => Object.keys(store).length,
  });
}

// --- Mock window for CLI Test Environment ---
if (typeof globalThis.window === "undefined") {
  globalThis.window = {
    __TAURI_INTERNALS__: undefined,
  } as any;
}

describe("JS Bridge - Environment Detection", () => {
  test("should detect non-tauri env by default in test runner", () => {
    expect(isTauriEnv()).toBe(false);
  });

  test("should detect tauri env when internals exist", () => {
    // Setup window mock
    const originalInternals = window.__TAURI_INTERNALS__;
    window.__TAURI_INTERNALS__ = {};
    
    expect(isTauriEnv()).toBe(true);

    // Cleanup
    window.__TAURI_INTERNALS__ = originalInternals;
  });
});

describe("JS Bridge - Mock Fallback APIs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("greet() should return browser mock greeting", async () => {
    const result = await mockBridge.greet("John");
    expect(result).toBe("Hello, John! You've been greeted from Browser Mock!");
  });

  test("checkForUpdates() should return mock updates info", async () => {
    const update = await mockBridge.checkForUpdates();
    expect(update.hasUpdate).toBe(true);
    expect(update.version).toBe("0.3.0");
  });

  test("selectDirectory() should return mock folder path", async () => {
    const originalPrompt = window.prompt;
    window.prompt = () => "/mock/path";
    const dir = await mockBridge.selectDirectory();
    expect(dir).toBe("/mock/path");
    window.prompt = originalPrompt;
  });

  test("initDb() should initialize empty sessions in localStorage", async () => {
    await mockBridge.initDb();
    const sessionsJson = localStorage.getItem("bridge_mock_sessions");
    const messagesJson = localStorage.getItem("bridge_mock_messages");
    
    expect(sessionsJson).toBe("[]");
    expect(messagesJson).toBe("[]");
  });

  test("saveSession() & getSessions() should insert and sort sessions", async () => {
    await mockBridge.initDb();

    const session1: Session = {
      id: "session-1",
      title: "First Session",
      lastMessage: "hello",
      updatedAt: new Date("2026-06-05T10:00:00Z").toISOString(),
      projectName: "deepseek-code",
    };

    const session2: Session = {
      id: "session-2",
      title: "Second Session",
      lastMessage: "world",
      updatedAt: new Date("2026-06-05T11:00:00Z").toISOString(), // Newer date
      projectName: "deepseek-code",
    };

    await mockBridge.saveSession(session1);
    await mockBridge.saveSession(session2);

    const sessions = await mockBridge.getSessions();
    expect(sessions.length).toBe(2);
    // session2 should be first because of newer updatedAt timestamp
    expect(sessions[0].id).toBe("session-2");
    expect(sessions[1].id).toBe("session-1");
  });

  test("saveMessage() & getMessages() should handle message lists", async () => {
    await mockBridge.initDb();

    const msg: Message = {
      id: "msg-1",
      sessionId: "session-1",
      role: "user",
      content: "Hi Agent",
      createdAt: new Date().toISOString(),
    };

    await mockBridge.saveMessage(msg);

    const msgs = await mockBridge.getMessages("session-1");
    expect(msgs.length).toBe(1);
    expect(msgs[0].content).toBe("Hi Agent");
    expect(msgs[0].role).toBe("user");
  });

  test("deleteSession() should delete session and cascade delete messages", async () => {
    await mockBridge.initDb();

    const session: Session = {
      id: "session-1",
      title: "To Delete",
      lastMessage: "bye",
      updatedAt: new Date().toISOString(),
    };

    const msg: Message = {
      id: "msg-1",
      sessionId: "session-1",
      role: "user",
      content: "Bye Agent",
      createdAt: new Date().toISOString(),
    };

    await mockBridge.saveSession(session);
    await mockBridge.saveMessage(msg);

    // Ensure they exist
    expect((await mockBridge.getSessions()).length).toBe(1);
    expect((await mockBridge.getMessages("session-1")).length).toBe(1);

    // Delete
    await mockBridge.deleteSession("session-1");

    // Verify deletion
    expect((await mockBridge.getSessions()).length).toBe(0);
    expect((await mockBridge.getMessages("session-1")).length).toBe(0);
  });

  test("saveSetting(), getSetting(), deleteSetting() should manage configuration settings", async () => {
    const initial = await mockBridge.getSetting("test_key");
    expect(initial).toBeNull();

    await mockBridge.saveSetting("test_key", "test_value");
    const val = await mockBridge.getSetting("test_key");
    expect(val).toBe("test_value");

    await mockBridge.deleteSetting("test_key");
    const deleted = await mockBridge.getSetting("test_key");
    expect(deleted).toBeNull();
  });
});

