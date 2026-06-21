import { describe, expect, test, mock, afterAll, beforeAll, beforeEach } from "bun:test";
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

  test("should write AGENTS.md and spawn Hermes process", async () => {
    await callAgent({
      agent: "hermes",
      promptVal: "Add mock feature",
      rulesPath: path.join(testRoot, ".agents/agent.md"),
      sandboxDir: testRoot,
      rootDir: testRoot
    });

    // Check AGENTS.md file content
    const agentsMdContent = fs.readFileSync(path.join(testRoot, "AGENTS.md"), "utf-8");
    expect(agentsMdContent).toContain("Mock Agent Rules for test-project");
    expect(agentsMdContent).toContain("- **test_rule** (主要修改路径: `src/`)");
    expect(agentsMdContent).toContain("- **TypeScript**：Use strong types always");
    expect(agentsMdContent).toContain("- **Tauri**：Keep business logic in front-end");
    expect(agentsMdContent).toContain("Add mock feature");

    // Check spawned processes
    expect(spawnedProcesses.length).toBe(1);
    expect(spawnedProcesses[0].cmd).toMatch(/hermes$/);
    expect(spawnedProcesses[0].args).toContain("chat");
    expect(spawnedProcesses[0].args).toContain("Add mock feature");
    expect(spawnedProcesses[0].args).toContain("-m");
    expect(spawnedProcesses[0].args).toContain("deepseek/mock-hermes-model");
  });

  test("should write AGENTS.md and spawn OpenCode sidecar process", async () => {
    fs.writeFileSync(path.join(testRoot, "mock_error.log"), "Mock compile error");

    await callAgent({
      agent: "opencode",
      rulesPath: path.join(testRoot, ".agents/agent.md"),
      fixTarget: path.join(testRoot, "mock_error.log"),
      sandboxDir: testRoot,
      rootDir: testRoot
    });

    const agentsMdContent = fs.readFileSync(path.join(testRoot, "AGENTS.md"), "utf-8");
    expect(agentsMdContent).toContain("Mock compile error");
    expect(agentsMdContent).toContain("OpenCode CI 自愈急救员");

    expect(spawnedProcesses.length).toBe(1);
    expect(spawnedProcesses[0].cmd).toBe("bun");
    expect(spawnedProcesses[0].args).toContain("run");
    expect(spawnedProcesses[0].env.OPENCODE_MODEL).toBe("mock-opencode-model");
    expect(spawnedProcesses[0].env.WORKSPACE_PATH).toBe(testRoot);
  });

  test("should throw an error for invalid agent", async () => {
    expect(callAgent({
      agent: "invalid-agent",
      promptVal: "Do something",
      sandboxDir: testRoot,
      rootDir: testRoot
    })).rejects.toThrow(/必须指定 agent 参数为 hermes 或 opencode/);
  });
});
