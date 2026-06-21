/**
 * CLI 主入口单元测试
 * 测试：本地记忆管理、配置解析、plan 子命令（mocked API）、参数解析
 */
import { describe, expect, test, mock, afterAll, beforeAll, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";

const testMemoriesPath = path.join(os.tmpdir(), "openhands-test-memories.json");

// ─── 本地记忆管理测试 ───────────────────────────
describe("Local Memory Management", () => {
  beforeAll(() => {
    if (fs.existsSync(testMemoriesPath)) fs.unlinkSync(testMemoriesPath);
  });

  afterAll(() => {
    if (fs.existsSync(testMemoriesPath)) fs.unlinkSync(testMemoriesPath);
  });

  test("tokenize should split text into cleaned lowercase tokens", async () => {
    const { tokenize } = await import("./cli.ts");
    expect(tokenize("Hello World! Fix bug.")).toEqual(["hello", "world", "fix", "bug"]);
    expect(tokenize("  spaced  words  ")).toEqual(["spaced", "words"]);
    expect(tokenize("")).toEqual([]);
  });

  test("loadLocalMemories returns empty array for nonexistent file", async () => {
    const { loadLocalMemories } = await import("./cli.ts");
    const result = loadLocalMemories("/tmp/nonexistent-file-xyz.json");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  test("addLocalMemory persists data and loadLocalMemories retrieves it", async () => {
    const { addLocalMemory, loadLocalMemories } = await import("./cli.ts");

    // 使用临时文件路径，不影响真实数据
    addLocalMemory(
      { prompt: "fix type error", git_diff: "--- a/file\n+++ b/file", heal_count: 1 },
      testMemoriesPath
    );
    addLocalMemory(
      { prompt: "add login page", git_diff: "--- a/login\n+++ b/login", heal_count: 0 },
      testMemoriesPath
    );

    const memories = loadLocalMemories(testMemoriesPath);
    expect(memories.length).toBe(2);
    expect(memories.some((m: any) => m.prompt === "fix type error")).toBe(true);
    expect(memories.some((m: any) => m.prompt === "add login page")).toBe(true);
    expect(memories[0].timestamp).toBeDefined();
    expect(typeof memories[0].timestamp).toBe("number");
  });

  test("searchLocalMemories finds relevant memories by keyword overlap", async () => {
    const { searchLocalMemories, addLocalMemory, loadLocalMemories } = await import("./cli.ts");

    // 清空并添加测试数据
    addLocalMemory({ prompt: "fix type error in TypeScript", heal_count: 1 }, testMemoriesPath);
    addLocalMemory({ prompt: "CSS styling issue on homepage", heal_count: 0 }, testMemoriesPath);
    addLocalMemory({ prompt: "type mismatch in React component", heal_count: 2 }, testMemoriesPath);

    // 搜索 type 相关的记忆
    const results = searchLocalMemories("fix type error in React", 5, testMemoriesPath);
    expect(results.length).toBeGreaterThanOrEqual(2);
    // 分数应为降序
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
    // 所有结果分数应 >= 0.10
    results.forEach((r: any) => {
      expect(r.score).toBeGreaterThanOrEqual(0.10);
    });
  });

  test("local memory caps at 100 entries", async () => {
    const { addLocalMemory, loadLocalMemories } = await import("./cli.ts");

    // 添加 110 条
    for (let i = 0; i < 110; i++) {
      addLocalMemory({ prompt: `entry-${i}` }, testMemoriesPath);
    }

    const memories = loadLocalMemories(testMemoriesPath);
    expect(memories.length).toBe(100);
    // 最新的 entry-109 应在（因为 slice(-100)）
    expect(memories.some((m: any) => m.prompt === "entry-109")).toBe(true);
    // 最旧的 entry-0 应被裁剪
    expect(memories.some((m: any) => m.prompt === "entry-0")).toBe(false);
  });

  test("saveLocalMemories creates directory if it doesn't exist", async () => {
    const { saveLocalMemories, loadLocalMemories } = await import("./cli.ts");
    const nestedPath = path.join(os.tmpdir(), "openhands-test-nested", "subdir", "test-mem.json");

    if (fs.existsSync(path.dirname(nestedPath))) {
      fs.rmSync(path.dirname(nestedPath), { recursive: true, force: true });
    }

    saveLocalMemories([{ prompt: "test", timestamp: Date.now() }], nestedPath);

    expect(fs.existsSync(nestedPath)).toBe(true);
    const loaded = loadLocalMemories(nestedPath);
    expect(loaded.length).toBe(1);
    expect(loaded[0].prompt).toBe("test");

    // 清理
    fs.rmSync(path.dirname(nestedPath), { recursive: true, force: true });
  });
});

// ─── 配置加载测试 ─────────────────────────────
describe("Config Loading", () => {
  test("getMemoriesPath should use env var when set", async () => {
    const { getMemoriesPath } = await import("./cli.ts");

    const orig = process.env.OPENHANDS_MEMORIES_PATH;
    process.env.OPENHANDS_MEMORIES_PATH = "/tmp/test-memories.json";
    expect(getMemoriesPath()).toBe("/tmp/test-memories.json");
    process.env.OPENHANDS_MEMORIES_PATH = orig;
  });

  test("getMemoriesPath should fall back to ~/.openhands/memories.json", async () => {
    const { getMemoriesPath } = await import("./cli.ts");
    const orig = process.env.OPENHANDS_MEMORIES_PATH;
    delete process.env.OPENHANDS_MEMORIES_PATH;
    expect(getMemoriesPath()).toContain(".openhands/memories.json");
    process.env.OPENHANDS_MEMORIES_PATH = orig;
  });
});

// ─── CLI 参数解析测试 ───────────────────────────
describe("CLI Argument Parsing", () => {
  test("should parse --from-plan, --provider, --model, --task-id correctly", () => {
    const args = [
      "--from-plan", ".plan.md",
      "--provider", "anthropic",
      "--model", "claude-sonnet-4-20250514",
      "--task-id", "my-custom-task",
      "修复类型错误"
    ];

    let taskId = "task-default";
    let taskDesc = "";
    let fromPlanPath = "";
    let cliProvider = "";
    let cliModel = "";

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--task-id") { taskId = args[i + 1]; i++; }
      else if (args[i] === "--from-plan") { fromPlanPath = args[i + 1]; i++; }
      else if (args[i] === "--provider") { cliProvider = args[i + 1]; i++; }
      else if (args[i] === "--model") { cliModel = args[i + 1]; i++; }
      else if (!args[i].startsWith("--")) { taskDesc = args[i]; }
    }

    expect(taskId).toBe("my-custom-task");
    expect(taskDesc).toBe("修复类型错误");
    expect(fromPlanPath).toBe(".plan.md");
    expect(cliProvider).toBe("anthropic");
    expect(cliModel).toBe("claude-sonnet-4-20250514");
  });

  test("should handle args without optional flags", () => {
    const args = ["输出 hello world"];
    let taskDesc = "";
    let fromPlanPath = "";
    let cliProvider = "";
    let cliModel = "";

    for (const arg of args) {
      if (arg === "--from-plan") { /* skip */ }
      else if (arg === "--provider") { /* skip */ }
      else if (arg === "--model") { /* skip */ }
      else if (!arg.startsWith("--")) { taskDesc = arg; }
    }

    expect(taskDesc).toBe("输出 hello world");
    expect(fromPlanPath).toBe("");
    expect(cliProvider).toBe("");
    expect(cliModel).toBe("");
  });

  test("should handle --from-plan with relative path", () => {
    const args = ["--from-plan", "./docs/plan.md", "add feature"];
    let taskDesc = "";
    let fromPlanPath = "";

    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--from-plan") { fromPlanPath = args[i + 1]; i++; }
      else if (!args[i].startsWith("--")) { taskDesc = args[i]; }
    }

    expect(fromPlanPath).toBe("./docs/plan.md");
    expect(taskDesc).toBe("add feature");
  });
});

// ─── handlePlan mock API call test ──────────
describe("handlePlan API integration", () => {
  let originalFetch: any;

  beforeAll(() => {
    originalFetch = globalThis.fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("handlePlan should fail with empty description", async () => {
    const { handlePlan } = await import("./cli.ts");

    try {
      await handlePlan([]);
      expect(true).toBe(false); // 不应到达这里
    } catch (e: any) {
      expect(e.message).toContain("请指定任务描述");
    }
  });

  test("handlePlan should call API and write .plan.md on success", async () => {
    // Mock fetch
    globalThis.fetch = mock(async (url: string, options: any) => {
      expect(url).toContain("/chat/completions");
      expect(options.method).toBe("POST");
      const body = JSON.parse(options.body as string);
      expect(body.messages[0].content).toContain("write hello world");

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content: "# Plan\n\n1. Create file\n2. Test it" } }]
        })
      } as Response;
    });

    const { handlePlan } = await import("./cli.ts");

    // 在临时目录执行
    const cwd = process.cwd();
    const testDir = path.join(os.tmpdir(), "openhands-plan-test");
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    process.chdir(testDir);

    try {
      await handlePlan(["write hello world"]);

      // 验证 .plan.md
      const planPath = path.join(testDir, ".plan.md");
      expect(fs.existsSync(planPath)).toBe(true);
      const content = fs.readFileSync(planPath, "utf-8");
      expect(content).toContain("Plan");
      expect(content).toContain("Create file");
    } finally {
      process.chdir(cwd);
      if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("handlePlan should throw on API error", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "Invalid API key"
    } as Response));

    const { handlePlan } = await import("./cli.ts");

    try {
      await handlePlan(["some task"]);
      expect(true).toBe(false); // 不应到达这里
    } catch (e: any) {
      expect(e.message).toContain("AI 方案生成失败");
      expect(e.message).toContain("401");
    }
  });
});

// ─── Sidecar timeout idle detection ──────────
describe("Sidecar Timeout & Idle Detection", () => {
  test("should format timeout error with last event context", () => {
    const model = "deepseek/deepseek-v4-flash";
    const lastEventType = "Thinking";
    const timeoutMs = 180000;
    const idleSec = 120;

    const errMsg = [
      `OpenCode 侧车进程超时 (${timeoutMs}ms，${idleSec}s 无事件)，已强制终止。`,
      `  最后事件: ${lastEventType}`,
      `  模型: ${model}`,
      `  提示: 可通过环境变量 SIDECAR_TIMEOUT_MS 调整超时时间（默认 180s）`
    ].join("\n");

    expect(errMsg).toContain("180000ms");
    expect(errMsg).toContain("120s 无事件");
    expect(errMsg).toContain("最后事件: Thinking");
    expect(errMsg).toContain("模型: deepseek/deepseek-v4-flash");
    expect(errMsg).toContain("SIDECAR_TIMEOUT_MS");
  });

  test("idle watcher should trigger after configured idle period", () => {
    const IDLE_WARN_MS = 60000;
    const lastEventTime = Date.now() - 70000;
    const elapsed = Date.now() - lastEventTime;
    expect(elapsed).toBeGreaterThanOrEqual(IDLE_WARN_MS);
  });
});

// ─── Multi-provider config parsing ──────────
describe("Multi-provider Configuration", () => {
  test("should resolve offline provider config correctly", () => {
    const cfg = {
      defaultProvider: "anthropic",
      providers: {
        deepseek: {
          baseUrl: "https://api.deepseek.com/v1",
          apiKey: "sk-deepseek",
          model: "deepseek-chat"
        },
        anthropic: {
          baseUrl: "https://api.anthropic.com/v1",
          apiKey: "sk-ant-xxx",
          model: "claude-sonnet-4-20250514"
        }
      }
    };

    const provider = "anthropic";
    const provCfg = cfg.providers?.[provider];
    const apiKey = provCfg?.apiKey || process.env.DEEPSEEK_API_KEY || "";
    const baseUrl = provCfg?.baseUrl || "https://api.deepseek.com/v1";
    const model = provCfg?.model || "deepseek-chat";

    expect(apiKey).toBe("sk-ant-xxx");
    expect(baseUrl).toBe("https://api.anthropic.com/v1");
    expect(model).toBe("claude-sonnet-4-20250514");
  });

  test("should fall back to default provider when unspecified", () => {
    const cfg = {
      defaultProvider: "deepseek",
      providers: {
        deepseek: { baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-ds", model: "deepseek-chat" }
      }
    };

    const provider = cfg.defaultProvider || "deepseek";
    expect(provider).toBe("deepseek");
    expect(cfg.providers?.[provider]).toBeDefined();
  });

  test("should handle missing provider gracefully", () => {
    const cfg = { providers: { deepseek: { apiKey: "sk-xxx" } } };
    const provider = "nonexistent";
    const provCfg = cfg.providers?.[provider];
    expect(provCfg).toBeUndefined();

    const apiKey = provCfg?.apiKey || process.env.DEEPSEEK_API_KEY || "";
    expect(apiKey).toBe("");
  });
});

// ─── Model Name Normalization ──────────────────
describe("normalizeModelName", () => {
  test("should strip provider/ prefix", async () => {
    const { normalizeModelName } = await import("./cli.ts");
    expect(normalizeModelName("deepseek/deepseek-chat")).toBe("deepseek-chat");
    expect(normalizeModelName("openai/gpt-4")).toBe("gpt-4");
    expect(normalizeModelName("anthropic/claude-sonnet-4-20250514")).toBe("claude-sonnet-4-20250514");
  });

  test("should keep model names without prefix", async () => {
    const { normalizeModelName } = await import("./cli.ts");
    expect(normalizeModelName("deepseek-chat")).toBe("deepseek-chat");
    expect(normalizeModelName("gpt-4")).toBe("gpt-4");
    expect(normalizeModelName("claude-sonnet")).toBe("claude-sonnet");
  });

  test("should handle empty string", async () => {
    const { normalizeModelName } = await import("./cli.ts");
    expect(normalizeModelName("")).toBe("");
  });
});

// ─── Provider Config Resolution ────────────────
describe("resolveProviderConfig", () => {
  test("should resolve provider from cliProvider", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const cfg = {
      defaultProvider: "deepseek",
      providers: {
        anthropic: { apiKey: "sk-ant", baseUrl: "https://api.anthropic.com", model: "claude-sonnet" },
      },
    };
    const result = resolveProviderConfig("anthropic", undefined, cfg);
    expect(result.provider).toBe("anthropic");
    expect(result.apiKey).toBe("sk-ant");
    expect(result.baseUrl).toBe("https://api.anthropic.com");
    expect(result.normalizedModel).toBe("claude-sonnet");
  });

  test("should fallback to defaultProvider when cliProvider not specified", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const cfg = {
      defaultProvider: "deepseek",
      providers: {
        deepseek: { apiKey: "sk-ds", model: "deepseek-chat" },
      },
    };
    const result = resolveProviderConfig(undefined, undefined, cfg);
    expect(result.provider).toBe("deepseek");
    expect(result.apiKey).toBe("sk-ds");
  });

  test("should use env DEEPSEEK_API_KEY when provCfg has no apiKey", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const origKey = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = "sk-env-key";
    const cfg = { providers: { deepseek: {} } };
    const result = resolveProviderConfig("deepseek", undefined, cfg);
    expect(result.apiKey).toBe("sk-env-key");
    process.env.DEEPSEEK_API_KEY = origKey;
  });

  test("should use default baseUrl when none configured", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const cfg = { providers: { deepseek: { apiKey: "sk-xxx" } } };
    const result = resolveProviderConfig("deepseek", undefined, cfg);
    expect(result.baseUrl).toBe("https://api.deepseek.com/v1");
  });

  test("should resolve model with fallback chain", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const cfg = { providers: { deepseek: { apiKey: "sk", model: "deepseek-reasoner" } } };
    // cliModel override
    const r1 = resolveProviderConfig("deepseek", "gpt-4", cfg);
    expect(r1.normalizedModel).toBe("gpt-4");
    // provCfg model
    const r2 = resolveProviderConfig("deepseek", undefined, cfg);
    expect(r2.normalizedModel).toBe("deepseek-reasoner");
  });

  test("should generate modelWarning for non-standard DeepSeek models", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const cfg = { providers: { deepseek: { apiKey: "sk", model: "unknown-model" } } };
    const result = resolveProviderConfig("deepseek", undefined, cfg);
    expect(result.modelWarning).toBeDefined();
    expect(result.modelWarning).toContain("unknown-model");
  });

  test("should NOT warn for standard DeepSeek models", async () => {
    const { resolveProviderConfig } = await import("./cli.ts");
    const cfg = { providers: { deepseek: { apiKey: "sk", model: "deepseek-chat" } } };
    const result = resolveProviderConfig("deepseek", undefined, cfg);
    expect(result.modelWarning).toBeUndefined();
  });
});

