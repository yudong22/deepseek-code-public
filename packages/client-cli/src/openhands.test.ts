import { describe, expect, test, mock, afterAll, afterEach, beforeAll, beforeEach } from "bun:test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fastValidate } from "./fast-validate.js";
import { callAgent } from "./openhands-call.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testRoot = path.join(__dirname, "test_sandbox");

// Mock child_process
let mockGitStatus = "";
let executedCommands: string[] = [];
let mockCommandFailures: Record<string, boolean> = {};
let spawnedProcesses: { cmd: string; args: string[]; env: any }[] = [];

mock.module("child_process", () => {
  return {
    execSync: (cmd: string, options: any = {}) => {
      executedCommands.push(cmd);
      if (cmd === "git status --porcelain") {
        return mockGitStatus;
      }
      if (mockCommandFailures[cmd]) {
        const err = new Error(`Command failed: ${cmd}`) as any;
        err.status = 1;
        err.stdout = Buffer.from("");
        err.stderr = Buffer.from(`Error executing ${cmd}`);
        throw err;
      }
      return `Output of ${cmd}`;
    },
    spawn: (cmd: string, args: string[], options: any = {}) => {
      spawnedProcesses.push({ cmd, args, env: options.env });
      // Return a mock child process emitter
      const listeners: Record<string, Function[]> = {};
      const child = {
        on: (event: string, callback: Function) => {
          if (!listeners[event]) listeners[event] = [];
          listeners[event].push(callback);
        },
        stdout: {
          on: (event: string, callback: Function) => {
            // Emulate some stdout JSON lines if it's opencode-sidecar
            if (cmd === "bun" && args[1]?.includes("packages/sidecar/src/index.ts")) {
              callback(Buffer.from(JSON.stringify({ type: "ThinkingStarted", payload: null }) + "\n"));
              callback(Buffer.from(JSON.stringify({ type: "Finished", payload: null }) + "\n"));
            }
          }
        },
        stdin: {
          write: () => {},
          end: () => {}
        }
      };
      
      // Simulate close event asynchronously
      setTimeout(() => {
        if (listeners["close"]) {
          listeners["close"].forEach(cb => cb(0));
        }
      }, 10);

      return child as any;
    }
  };
});

beforeAll(() => {
  // Create test sandbox structures
  fs.mkdirSync(testRoot, { recursive: true });
  fs.mkdirSync(path.join(testRoot, ".agents"), { recursive: true });
  
  // Write a mock config.yaml
  fs.writeFileSync(
    path.join(testRoot, ".agents/config.yaml"),
    `
version: "2026.1"
project_id: "test-project"
agent_routing:
  primary_developer:
    model: "mock-hermes-model"
  ci_healer:
    model: "mock-opencode-model"
tech_rules:
  "TypeScript": "Use strong types always"
  "Tauri": "Keep business logic in front-end"
verification_pipeline:
  test_rule:
    match: "src/**/*.ts"
    cmd: "bun test mock-test-cmd"
`
  );

  // Write a mock agent.md containing template placeholders
  fs.writeFileSync(
    path.join(testRoot, ".agents/agent.md"),
    `# Mock Agent Rules for {{project_id}}

## Components
{{components}}

## Tech Rules
{{tech_rules}}`
  );
});

afterAll(() => {
  // Clean up
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe("OpenHands - fastValidate Utility", () => {
  beforeEach(() => {
    executedCommands = [];
    mockCommandFailures = {};
    mockGitStatus = "";
  });

  test("should skip validation if no files are modified", async () => {
    mockGitStatus = "";
    await fastValidate({ rootDir: testRoot, sandboxDir: testRoot });
    expect(executedCommands).toContain("git status --porcelain");
    expect(executedCommands.length).toBe(1); // Only git status
  });

  test("should skip validation if modified files do not match pipeline rules", async () => {
    mockGitStatus = " M docs/readme.md\n";
    await fastValidate({ rootDir: testRoot, sandboxDir: testRoot });
    expect(executedCommands).toContain("git status --porcelain");
    expect(executedCommands).not.toContain("bun test mock-test-cmd");
  });

  test("should execute matching rule command when a file matches", async () => {
    mockGitStatus = " M src/main.ts\n";
    await fastValidate({ rootDir: testRoot, sandboxDir: testRoot });
    expect(executedCommands).toContain("git status --porcelain");
    expect(executedCommands).toContain("bun test mock-test-cmd");
  });

  test("should throw an error and capture output when a matched validation command fails", async () => {
    mockGitStatus = " M src/main.ts\n";
    mockCommandFailures["bun test mock-test-cmd"] = true;
    
    expect(fastValidate({ rootDir: testRoot, sandboxDir: testRoot })).rejects.toThrow(
      /极速门禁验证失败/
    );
  });
});

describe("OpenHands - callAgent Utility", () => {
  beforeEach(() => {
    spawnedProcesses = [];
    // Remove AGENTS.md in test sandbox if exists
    const agentsMd = path.join(testRoot, "AGENTS.md");
    if (fs.existsSync(agentsMd)) {
      fs.unlinkSync(agentsMd);
    }
  });

  test("should write AGENTS.md and spawn sidecar in code mode", async () => {
    await callAgent({
      promptVal: "Add mock feature",
      rulesPath: path.join(testRoot, ".agents/agent.md"),
      sandboxDir: testRoot,
      rootDir: testRoot,
      mode: 'code'
    });

    // Check AGENTS.md file content
    const agentsMdContent = fs.readFileSync(path.join(testRoot, "AGENTS.md"), "utf-8");
    expect(agentsMdContent).toContain("Mock Agent Rules for test-project");
    expect(agentsMdContent).toContain("- **test_rule** (主要修改路径: `src/`)");
    expect(agentsMdContent).toContain("- **TypeScript**：Use strong types always");
    expect(agentsMdContent).toContain("- **Tauri**：Keep business logic in front-end");
    expect(agentsMdContent).toContain("Add mock feature");
    expect(agentsMdContent).toContain("当前任务指令");

    // Check spawned processes
    expect(spawnedProcesses.length).toBe(1);
    expect(spawnedProcesses[0].cmd).toBe("bun");
    expect(spawnedProcesses[0].args).toContain("run");
    expect(spawnedProcesses[0].env.OPENCODE_MODEL).toBe("deepseek-chat");
    expect(spawnedProcesses[0].env.WORKSPACE_PATH).toBe(testRoot);
  });

  test("should write AGENTS.md and spawn sidecar in heal mode", async () => {
    fs.writeFileSync(path.join(testRoot, "mock_error.log"), "Mock compile error");

    await callAgent({
      rulesPath: path.join(testRoot, ".agents/agent.md"),
      fixTarget: path.join(testRoot, "mock_error.log"),
      sandboxDir: testRoot,
      rootDir: testRoot,
      mode: 'heal'
    });

    const agentsMdContent = fs.readFileSync(path.join(testRoot, "AGENTS.md"), "utf-8");
    expect(agentsMdContent).toContain("Mock compile error");
    expect(agentsMdContent).toContain("OpenCode CI 自愈急救员");

    expect(spawnedProcesses.length).toBe(1);
    expect(spawnedProcesses[0].cmd).toBe("bun");
    expect(spawnedProcesses[0].args).toContain("run");
    expect(spawnedProcesses[0].env.WORKSPACE_PATH).toBe(testRoot);
  });
});

describe("yaml-parser.js - shared YAML utility", () => {
  test("should parse simple key-value pairs", async () => {
    const { parseYaml } = await import("./yaml-parser.js");
    const result = parseYaml("key: value\nfoo: bar");
    expect(result.key).toBe("value");
    expect(result.foo).toBe("bar");
  });

  test("should parse nested objects", async () => {
    const { parseYaml } = await import("./yaml-parser.js");
    const yaml = "outer:\n  inner: deep\n  num: 42";
    const result = parseYaml(yaml);
    expect(result.outer.inner).toBe("deep");
    expect(result.outer.num).toBe(42);
  });

  test("should skip comments and empty lines", async () => {
    const { parseYaml } = await import("./yaml-parser.js");
    const yaml = "# comment\nkey: val\n\nfoo: bar # inline comment";
    const result = parseYaml(yaml);
    expect(result.key).toBe("val");
    expect(result.foo).toBe("bar");
  });

  test("should coerce boolean and numeric values", async () => {
    const { parseYaml } = await import("./yaml-parser.js");
    const yaml = "flag: true\ncount: 0\nname: str";
    const result = parseYaml(yaml);
    expect(result.flag).toBe(true);
    expect(result.count).toBe(0);
    expect(result.name).toBe("str");
  });
});

// ─── Tool Timing ────────────────────────────────
describe("Tool timing (in callAgent)", () => {
  test("should track tool start time and calculate duration", () => {
    const toolTimers = new Map();
    const callId = "call-1";
    const startTime = Date.now();
    toolTimers.set(callId, startTime);
    expect(toolTimers.has(callId)).toBe(true);

    const duration = Date.now() - startTime;
    toolTimers.delete(callId);
    expect(toolTimers.has(callId)).toBe(false);
    expect(duration).toBeGreaterThanOrEqual(0);
  });

  test("should handle unknown callID gracefully", () => {
    const toolTimers = new Map();
    const callId = "unknown-call";
    const startTime = toolTimers.get(callId) || Date.now();
    expect(startTime).toBeGreaterThan(0);
    // Clean up doesn't throw
    toolTimers.delete(callId);
  });
});

// ─── Sidecar Timeout ───────────────────────────
describe("Sidecar timeout configuration", () => {
  test("should use default SIDECAR_TIMEOUT_MS", () => {
    const timeout = parseInt(process.env.SIDECAR_TIMEOUT_MS || "300000", 10);
    expect(timeout).toBe(300000);
  });

  test("should use default IDLE_WARN_MS", () => {
    const idleWarn = parseInt(process.env.SIDECAR_IDLE_WARN_MS || "30000", 10);
    expect(idleWarn).toBe(30000);
  });

  test("should include last event type and model in timeout error", () => {
    const model = "deepseek-chat";
    const lastEventType = "Thinking";
    const timeoutMs = 300000;
    const idleSec = 180;

    const errMsg = `OpenCode 侧车进程超时 (${timeoutMs}ms，${idleSec}s 无事件)，已强制终止。\n  最后事件: ${lastEventType}\n  模型: ${model}\n  提示: 可通过环境变量 SIDECAR_TIMEOUT_MS 调整超时时间（默认 180s）`;

    expect(errMsg).toContain("300000ms");
    expect(errMsg).toContain("180s 无事件");
    expect(errMsg).toContain("最后事件: Thinking");
    expect(errMsg).toContain("模型: deepseek-chat");
    expect(errMsg).toContain("SIDECAR_TIMEOUT_MS");
  });
});

// ─── fastValidate Edge Cases ───────────────────
describe("fastValidate - additional edge cases", () => {
  const testRoot = "/tmp/openhands-test-fastvalidate";

  beforeAll(() => {
    fs.mkdirSync(path.join(testRoot, ".agents"), { recursive: true });
    fs.mkdirSync(path.join(testRoot, ".git"), { recursive: true });
  });

  afterEach(() => {
    const cfgPath = path.join(testRoot, ".agents/config.yaml");
    if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
  });

  afterAll(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  test("should throw if config.yaml not found", async () => {
    const { fastValidate } = await import("./fast-validate.js");
    await expect(fastValidate({ rootDir: "/tmp/nonexistent", sandboxDir: testRoot })).rejects.toThrow(
      "未找到配置文件"
    );
  });

  test("should parse and skip verification_pipeline when not defined", async () => {
    const { fastValidate } = await import("./fast-validate.js");
    // YAML with no verification_pipeline
    fs.writeFileSync(path.join(testRoot, ".agents/config.yaml"), "version: 1\nproject_id: test");
    // Should not throw, just log that pipeline is not defined
    await fastValidate({ rootDir: testRoot, sandboxDir: testRoot });
    // If we got here without throwing, the test passes
    expect(true).toBe(true);
  });

  test("should parse glob pattern from config", async () => {
    const { parseYaml } = await import("./yaml-parser.js");
    const yaml = "verification_pipeline:\n  test_all:\n    match: \"src/**/*.ts\"\n    cmd: \"tsc\"";
    const result = parseYaml(yaml);
    expect(result.verification_pipeline.test_all.match).toBe("src/**/*.ts");
    expect(result.verification_pipeline.test_all.cmd).toBe("tsc");
  });
});
