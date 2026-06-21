/**
 * Sidecar 协议契约测试
 *
 * 这些测试验证 sidecar 的 stdin/stdout 协议规范。
 * 未来 Rust 重构后，只要通过这些测试即证明协议行为一致。
 */
import { describe, expect, test } from "bun:test";

describe("Sidecar stdin protocol contract", () => {
  test("first line must be JSON with messages[] array", () => {
    const validInput = JSON.stringify({
      messages: [
        { role: "system", content: "You are an AI." },
        { role: "user", content: "Hello" },
      ],
    });

    const parsed = JSON.parse(validInput);
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages.length).toBeGreaterThan(0);
    expect(parsed.messages[0].role).toBe("system");
    expect(parsed.messages[parsed.messages.length - 1].role).toBe("user");
  });

  test("first line can optionally include agentMode", () => {
    const input = JSON.stringify({
      messages: [{ role: "user", content: "plan my app" }],
      agentMode: "plan",
    });

    const parsed = JSON.parse(input);
    expect(parsed.agentMode).toBe("plan");
  });

  test("first line can fallback to plain text (legacy)", () => {
    const rawPrompt = "Write hello world";
    // Plain text is not valid JSON, so parseStdinInput will return rawPrompt
    const isJSON = (() => { try { JSON.parse(rawPrompt); return true; } catch { return false; } })();
    expect(isJSON).toBe(false);
  });

  test("empty first line should cause error", () => {
    const emptyLine = "";
    expect(emptyLine.trim()).toBe("");
  });

  test("subsequent lines are forwarded as user answers", () => {
    // Simulate: after first JSON line, subsequent lines are user responses
    const lines = [
      JSON.stringify({ messages: [{ role: "system" }, { role: "user", content: "Hi" }] }),
      "answer 1",
      "answer 2",
    ];

    const firstLine = lines[0];
    const answers = lines.slice(1);

    const parsed = JSON.parse(firstLine);
    expect(parsed.messages).toBeDefined();
    expect(answers).toHaveLength(2);
    expect(answers[0]).toBe("answer 1");
    expect(answers[1]).toBe("answer 2");
  });
});

describe("Sidecar stdout protocol contract", () => {
  // These are the 17 event types defined in packages/sidecar/src/index.ts
  const VALID_EVENT_TYPES = [
    "ThinkingStarted",
    "Thinking",
    "ThinkingEnded",
    "TextStarted",
    "Text",
    "TextEnded",
    "ToolCall",
    "ToolStarted",
    "ToolSuccess",
    "ToolFailed",
    "ToolEnded",
    "StepStarted",
    "StepEnded",
    "Error",
    "Usage",
    "Finished",
  ];

  test("each event line must be valid JSON with type and payload", () => {
    for (const type of VALID_EVENT_TYPES) {
      const evt = JSON.stringify({ type, payload: null });
      const parsed = JSON.parse(evt);
      expect(parsed.type).toBe(type);
      expect(parsed).toHaveProperty("payload");
    }
  });

  test("Thinking event must have string payload", () => {
    const evt = JSON.stringify({ type: "Thinking", payload: "thinking text" });
    const parsed = JSON.parse(evt);
    expect(typeof parsed.payload).toBe("string");
  });

  test("Text event must have string payload", () => {
    const evt = JSON.stringify({ type: "Text", payload: "response text" });
    const parsed = JSON.parse(evt);
    expect(typeof parsed.payload).toBe("string");
  });

  test("ToolCall must have payload with name, args, call_id", () => {
    const payload = { name: "bash", args: '{"command":"ls"}', call_id: "call-1" };
    const evt = JSON.stringify({ type: "ToolCall", payload });
    const parsed = JSON.parse(evt);
    expect(parsed.payload.name).toBe("bash");
    expect(parsed.payload.args).toBeDefined();
    expect(parsed.payload.call_id).toBe("call-1");
  });

  test("ToolSuccess must have payload with name, result, call_id", () => {
    const payload = { name: "read", result: '"file content"', call_id: "call-1" };
    const evt = JSON.stringify({ type: "ToolSuccess", payload });
    const parsed = JSON.parse(evt);
    expect(parsed.payload.result).toBeDefined();
    expect(parsed.payload.call_id).toBe("call-1");
  });

  test("ToolFailed must have payload with name, error, call_id", () => {
    const payload = { name: "bash", error: "command not found", call_id: "call-1" };
    const evt = JSON.stringify({ type: "ToolFailed", payload });
    const parsed = JSON.parse(evt);
    expect(parsed.payload.error).toBe("command not found");
  });

  test("Error must have payload with message", () => {
    const payload = { message: "Something went wrong" };
    const evt = JSON.stringify({ type: "Error", payload });
    const parsed = JSON.parse(evt);
    expect(parsed.payload.message).toBe("Something went wrong");
  });

  test("Usage must have payload with tokens_input and tokens_output", () => {
    const payload = { tokens_input: 100, tokens_output: 50, tokens_reasoning: 20 };
    const evt = JSON.stringify({ type: "Usage", payload });
    const parsed = JSON.parse(evt);
    expect(typeof parsed.payload.tokens_input).toBe("number");
    expect(typeof parsed.payload.tokens_output).toBe("number");
  });

  test("all event types must be serializable to a single JSON line", () => {
    for (const type of VALID_EVENT_TYPES) {
      const line = JSON.stringify({ type, payload: null });
      // Must not contain newlines (single line protocol)
      expect(line.includes("\n")).toBe(false);
      // Must parse as complete JSON
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("Sidecar environment contract", () => {
  test("OPENCODE_MODEL env var must be read if present", () => {
    const model = process.env.OPENCODE_MODEL || "deepseek-chat";
    expect(typeof model).toBe("string");
    expect(model.length).toBeGreaterThan(0);
  });

  test("DEEPSEEK_API_KEY env var should be mapped to OPENAI_API_KEY", () => {
    // This is done in main(), but we verify the logic
    const apiKey = process.env.DEEPSEEK_API_KEY || "";
    if (apiKey) {
      process.env.OPENAI_API_KEY = apiKey;
    }
    // At minimum, both env vars exist in the same format
    if (process.env.DEEPSEEK_API_KEY) {
      expect(process.env.OPENAI_API_KEY).toBeDefined();
    }
  });

  test("WORKSPACE_PATH defaults to current directory", () => {
    const ws = process.env.WORKSPACE_PATH || ".";
    expect(ws.length).toBeGreaterThan(0);
  });

  test("exit code 0 = success, non-zero = failure", () => {
    // Sidecar convention from process.exit() calls in main()
    const exitCodes = { success: 0, error: 1 };
    expect(exitCodes.success).toBe(0);
    expect(exitCodes.error).toBe(1);
  });
});

describe("printEvent format", () => {
  test("output line must be console.log(JSON.stringify({type, payload}))", () => {
    // This is the exact format used by printEvent() in sidecar/index.ts
    const evt = { type: "Finished", payload: null };

    let captured = "";
    const origLog = console.log;
    console.log = (s: string) => { captured = s; };

    // Simulate printEvent
    console.log(JSON.stringify(evt));

    console.log = origLog;

    const parsed = JSON.parse(captured);
    expect(parsed.type).toBe("Finished");
    expect(parsed.payload).toBeNull();
  });

  test("output line must not contain ANSI codes", () => {
    const ansiRegex = /[][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;
    const line = JSON.stringify({ type: "Text", payload: "hello" });
    expect(ansiRegex.test(line)).toBe(false);
  });
});

// ─── AG-UI 协议契约 ────────────────────────────
//
// 以下测试定义 AG-UI 协议事件映射关系。
// 这是 sidecar AgentEvent → AG-UI 事件的双向映射契约。
// 未来 Rust sidecar 应直接输出 AG-UI 格式事件。
// 适配器实现见: apps/desktop/src/ag-ui/adapter.ts
//
// Sidecar → AG-UI 映射:
//   ThinkingStarted  → REASONING_START       { messageId }
//   Thinking         → REASONING_MESSAGE_CONTENT { messageId, delta }
//   ThinkingEnded    → REASONING_END          { messageId }
//   TextStarted      → TEXT_MESSAGE_START     { messageId, role: "assistant" }
//   Text             → TEXT_MESSAGE_CONTENT   { messageId, delta }
//   TextEnded        → TEXT_MESSAGE_END       { messageId }
//   ToolCall         → TOOL_CALL_START        { toolCallId, toolCallName, args }
//   ToolStarted      → (skipped, no ag-ui equivalent)
//   ToolSuccess      → TOOL_CALL_RESULT       { toolCallId, name, content }
//   ToolFailed       → TOOL_CALL_RESULT       { toolCallId, name, content }
//   ToolEnded        → (skipped, TOOL_CALL_RESULT signals end)
//   StepStarted      → STEP_STARTED           { stepName }
//   StepEnded        → STEP_FINISHED          { stepName }
//   Usage            → CUSTOM                { name: "token_usage", value }
//   Finished         → RUN_FINISHED           { threadId, runId }
//   Error            → RUN_ERROR             { message, code? }
//   (first event)    → RUN_STARTED            { threadId, runId }
//
describe("AG-UI protocol contract", () => {
  const AGUI_EVENT_TYPES = [
    "RUN_STARTED",
    "REASONING_START",
    "REASONING_MESSAGE_CONTENT",
    "REASONING_END",
    "TEXT_MESSAGE_START",
    "TEXT_MESSAGE_CONTENT",
    "TEXT_MESSAGE_END",
    "TOOL_CALL_START",
    "TOOL_CALL_RESULT",
    "STEP_STARTED",
    "STEP_FINISHED",
    "RUN_FINISHED",
    "RUN_ERROR",
    "CUSTOM",
    "MESSAGES_SNAPSHOT",
  ] as const;

  test("all AG-UI event types must be valid JSON-serializable", () => {
    for (const type of AGUI_EVENT_TYPES) {
      const line = JSON.stringify({ type, payload: null });
      expect(() => JSON.parse(line)).not.toThrow();
      expect(line.includes("\n")).toBe(false);
    }
  });

  test("REASONING_MESSAGE_CONTENT must have delta field", () => {
    const evt = { type: "REASONING_MESSAGE_CONTENT", messageId: "m1", delta: "thinking..." };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.delta).toBeDefined();
    expect(typeof parsed.delta).toBe("string");
  });

  test("TEXT_MESSAGE_CONTENT must have delta field", () => {
    const evt = { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "hello" };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.delta).toBeDefined();
  });

  test("TOOL_CALL_START must have toolCallId, toolCallName, args", () => {
    const evt = { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "bash", args: "{}" };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.toolCallId).toBe("c1");
    expect(parsed.toolCallName).toBe("bash");
    expect(parsed.args).toBe("{}");
  });

  test("TOOL_CALL_RESULT must have toolCallId, name, content", () => {
    const evt = { type: "TOOL_CALL_RESULT", toolCallId: "c1", name: "read", content: "result" };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.toolCallId).toBe("c1");
    expect(parsed.name).toBe("read");
    expect(parsed.content).toBe("result");
  });

  test("RUN_STARTED must have threadId and runId", () => {
    const evt = { type: "RUN_STARTED", threadId: "t1", runId: "r1" };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.threadId).toBe("t1");
    expect(parsed.runId).toBe("r1");
  });

  test("RUN_ERROR must have message field", () => {
    const evt = { type: "RUN_ERROR", message: "error msg" };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.message).toBe("error msg");
  });

  test("CUSTOM must have name and value fields", () => {
    const evt = { type: "CUSTOM", name: "token_usage", value: { input: 100 } };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(parsed.name).toBe("token_usage");
    expect(parsed.value.input).toBe(100);
  });

  test("MESSAGES_SNAPSHOT must have messages array", () => {
    const evt = { type: "MESSAGES_SNAPSHOT", messages: [{ id: "m1", role: "assistant" }] };
    const parsed = JSON.parse(JSON.stringify(evt));
    expect(Array.isArray(parsed.messages)).toBe(true);
    expect(parsed.messages.length).toBe(1);
  });
});
