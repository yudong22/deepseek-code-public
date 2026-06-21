/**
 * AG-UI 适配器单元测试
 *
 * 验证 sidecar AgentEvent → AG-UI 协议事件的转换正确性。
 * 这些测试是未来 Rust sidecar 重写的契约测试。
 */
import { describe, expect, test } from "bun:test";
import { AGUIEventAdapter, EventType } from "./index";
import type { AgentEvent } from "../bridge/types";

function makeEvent(type: AgentEvent["type"], payload?: any): AgentEvent {
  return { type, payload: payload ?? null } as AgentEvent;
}

describe("AGUIEventAdapter - RUN_STARTED", () => {
  test("should emit RUN_STARTED on first event", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(makeEvent("ThinkingStarted"));
    expect(events.length).toBeGreaterThanOrEqual(1);
    const runStarted = events[0];
    expect(runStarted.type).toBe(EventType.RUN_STARTED);
    if (runStarted.type === EventType.RUN_STARTED) {
      expect(runStarted.threadId).toBeDefined();
      expect(runStarted.runId).toBeDefined();
      expect(typeof runStarted.threadId).toBe("string");
    }
  });

  test("should emit RUN_STARTED only once", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("ThinkingStarted"));
    const secondBatch = adapter.process(makeEvent("TextStarted"));
    const runStartedCount = secondBatch.filter(
      (e) => e.type === EventType.RUN_STARTED,
    ).length;
    expect(runStartedCount).toBe(0);
  });

  test("should generate unique threadId and runId per instance", () => {
    const a1 = new AGUIEventAdapter();
    const a2 = new AGUIEventAdapter();
    a1.process(makeEvent("ThinkingStarted"));
    a2.process(makeEvent("ThinkingStarted"));
    expect(a1.getThreadId()).not.toBe(a2.getThreadId());
    expect(a1.getRunId()).not.toBe(a2.getRunId());
  });
});

describe("AGUIEventAdapter - Reasoning events", () => {
  test("ThinkingStarted → REASONING_START", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(makeEvent("ThinkingStarted")).filter(e => e.type !== EventType.RUN_STARTED);
    expect(events[0]).toMatchObject({ type: EventType.REASONING_START });
  });

  test("Thinking → REASONING_MESSAGE_CONTENT with delta", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("ThinkingStarted")); // need to start first
    const events = adapter.process(makeEvent("Thinking", "thinking...")).filter(e => e.type !== EventType.RUN_STARTED);
    const content = events.find(e => e.type === EventType.REASONING_MESSAGE_CONTENT);
    expect(content).toBeDefined();
    if (content?.type === EventType.REASONING_MESSAGE_CONTENT) {
      expect(content.delta).toBe("thinking...");
    }
  });

  test("ThinkingEnded → REASONING_END", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("ThinkingStarted"));
    const events = adapter.process(makeEvent("ThinkingEnded")).filter(e => e.type !== EventType.RUN_STARTED);
    expect(events[0]).toMatchObject({ type: EventType.REASONING_END });
  });

  test("accumulates thinking content across multiple Thinking events", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("ThinkingStarted"));
    adapter.process(makeEvent("Thinking", "step1 "));
    adapter.process(makeEvent("Thinking", "step2"));
    adapter.process(makeEvent("ThinkingEnded"));

    const snapshot = adapter.getMessagesSnapshot();
    const reasoningMsg = snapshot.messages.find(m => m.role === "reasoning");
    expect(reasoningMsg).toBeDefined();
    expect(reasoningMsg?.content).toBe("step1 step2");
  });
});

describe("AGUIEventAdapter - Text events", () => {
  test("TextStarted → TEXT_MESSAGE_START", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(makeEvent("TextStarted")).filter(e => e.type !== EventType.RUN_STARTED);
    const start = events[0];
    expect(start.type).toBe(EventType.TEXT_MESSAGE_START);
    if (start.type === EventType.TEXT_MESSAGE_START) {
      expect(start.role).toBe("assistant");
    }
  });

  test("Text → TEXT_MESSAGE_CONTENT with delta", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("TextStarted"));
    const events = adapter.process(makeEvent("Text", "Hello!")).filter(e => e.type !== EventType.RUN_STARTED);
    const content = events.find(e => e.type === EventType.TEXT_MESSAGE_CONTENT);
    expect(content).toBeDefined();
    if (content?.type === EventType.TEXT_MESSAGE_CONTENT) {
      expect(content.delta).toBe("Hello!");
    }
  });

  test("accumulates text content across chunks", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("TextStarted"));
    adapter.process(makeEvent("Text", "Hello "));
    adapter.process(makeEvent("Text", "World!"));
    adapter.process(makeEvent("TextEnded"));

    const snapshot = adapter.getMessagesSnapshot();
    const assistantMsg = snapshot.messages.find(m => m.role === "assistant");
    expect(assistantMsg?.content).toBe("Hello World!");
  });
});

describe("AGUIEventAdapter - Tool events", () => {
  test("ToolCall → TOOL_CALL_START with toolCallId/name/args", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(
      makeEvent("ToolCall", { name: "bash", args: '{"cmd":"ls"}', call_id: "c1" }),
    ).filter(e => e.type !== EventType.RUN_STARTED);
    const start = events[0];
    expect(start.type).toBe(EventType.TOOL_CALL_START);
    if (start.type === EventType.TOOL_CALL_START) {
      expect(start.toolCallName).toBe("bash");
      expect(start.toolCallId).toBe("c1");
      expect(start.args).toBe('{"cmd":"ls"}');
    }
  });

  test("ToolStarted is skipped (no ag-ui equivalent)", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(makeEvent("ToolStarted", { call_id: "c1" }));
    // Only RUN_STARTED should be present (ToolStarted is skipped)
    const nonRun = events.filter(e => e.type !== EventType.RUN_STARTED);
    expect(nonRun.length).toBe(0);
  });

  test("ToolSuccess → TOOL_CALL_RESULT", () => {
    const adapter = new AGUIEventAdapter();
    // First a tool call
    adapter.process(makeEvent("ToolCall", { name: "read", args: '{"path":"f"}', call_id: "c1" }));
    // Then success
    const events = adapter.process(
      makeEvent("ToolSuccess", { name: "read", result: '"content"', call_id: "c1" }),
    ).filter(e => e.type !== EventType.RUN_STARTED);
    const result = events.find(e => e.type === EventType.TOOL_CALL_RESULT);
    expect(result).toBeDefined();
    if (result?.type === EventType.TOOL_CALL_RESULT) {
      expect(result.content).toBe('"content"');
    }
  });

  test("ToolFailed → TOOL_CALL_RESULT with error content", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("ToolCall", { name: "bash", args: "{}", call_id: "c1" }));
    const events = adapter.process(
      makeEvent("ToolFailed", { name: "bash", error: "not found", call_id: "c1" }),
    ).filter(e => e.type !== EventType.RUN_STARTED);
    const result = events.find(e => e.type === EventType.TOOL_CALL_RESULT);
    expect(result).toBeDefined();
    if (result?.type === EventType.TOOL_CALL_RESULT) {
      expect(result.content).toBe("not found");
    }
  });

  test("ToolEnded is skipped", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(makeEvent("ToolEnded", { call_id: "c1" }));
    const nonRun = events.filter(e => e.type !== EventType.RUN_STARTED);
    expect(nonRun.length).toBe(0);
  });

  test("tracks tool calls on assistant messages", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("TextStarted"));
    adapter.process(makeEvent("Text", "Let me check"));
    adapter.process(makeEvent("ToolCall", { name: "bash", args: '{"cmd":"ls"}', call_id: "c1" }));
    adapter.process(makeEvent("ToolSuccess", { name: "bash", result: '"file.txt"', call_id: "c1" }));

    const snapshot = adapter.getMessagesSnapshot();
    const assistantMsg = snapshot.messages.find(m => m.role === "assistant");
    expect(assistantMsg?.toolCalls).toHaveLength(1);
    expect(assistantMsg?.toolCalls?.[0].name).toBe("bash");
    expect(assistantMsg?.toolCalls?.[0].result).toBe('"file.txt"');
  });
});

describe("AGUIEventAdapter - Step events", () => {
  test("StepStarted → STEP_STARTED with stepName", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(makeEvent("StepStarted")).filter(e => e.type !== EventType.RUN_STARTED);
    const step = events[0];
    expect(step.type).toBe(EventType.STEP_STARTED);
    if (step.type === EventType.STEP_STARTED) {
      expect(step.stepName).toMatch(/^step_/);
    }
  });

  test("StepEnded → STEP_FINISHED with stepName", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("StepStarted"));
    const events = adapter.process(makeEvent("StepEnded")).filter(e => e.type !== EventType.RUN_STARTED);
    const step = events[0];
    expect(step.type).toBe(EventType.STEP_FINISHED);
    if (step.type === EventType.STEP_FINISHED) {
      expect(step.stepName).toMatch(/^step_/);
    }
  });
});

describe("AGUIEventAdapter - Finished / Error / Usage", () => {
  test("Usage → CUSTOM with token_usage name", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(
      makeEvent("Usage", { tokens_input: 100, tokens_output: 50, tokens_reasoning: 20 }),
    ).filter(e => e.type !== EventType.RUN_STARTED);
    const custom = events[0];
    expect(custom.type).toBe(EventType.CUSTOM);
    if (custom.type === EventType.CUSTOM) {
      expect(custom.name).toBe("token_usage");
      expect(custom.value.tokens_input).toBe(100);
    }
  });

  test("Finished → RUN_FINISHED + MESSAGES_SNAPSHOT", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("TextStarted"));
    adapter.process(makeEvent("Text", "Done"));
    const events = adapter.process(makeEvent("Finished"));
    const runFinished = events.find(e => e.type === EventType.RUN_FINISHED);
    const snapshot = events.find(e => e.type === EventType.MESSAGES_SNAPSHOT);
    expect(runFinished).toBeDefined();
    expect(snapshot).toBeDefined();
  });

  test("Error → RUN_ERROR with message", () => {
    const adapter = new AGUIEventAdapter();
    const events = adapter.process(
      makeEvent("Error", { message: "Something went wrong" }),
    ).filter(e => e.type !== EventType.RUN_STARTED);
    const err = events[0];
    expect(err.type).toBe(EventType.RUN_ERROR);
    if (err.type === EventType.RUN_ERROR) {
      expect(err.message).toBe("Something went wrong");
    }
  });
});

describe("AGUIEventAdapter - Full lifecycle integration", () => {
  test("should produce all events in correct order", () => {
    const adapter = new AGUIEventAdapter();

    const fullEvents: any[] = [];
    const track = (event: AgentEvent) => {
      fullEvents.push(...adapter.process(event));
    };

    track(makeEvent("ThinkingStarted"));
    track(makeEvent("Thinking", "calculating"));
    track(makeEvent("ThinkingEnded"));
    track(makeEvent("TextStarted"));
    track(makeEvent("Text", "Result: "));
    track(makeEvent("ToolCall", { name: "bash", args: '{"cmd":"echo hi"}', call_id: "c1" }));
    track(makeEvent("ToolSuccess", { name: "bash", result: '"hi"', call_id: "c1" }));
    track(makeEvent("Text", "done"));
    track(makeEvent("TextEnded"));
    track(makeEvent("Usage", { tokens_input: 50, tokens_output: 20 }));
    track(makeEvent("Finished"));

    // Verify sequence
    const types = fullEvents.map(e => e.type);
    expect(types[0]).toBe(EventType.RUN_STARTED);
    expect(types).toContain(EventType.REASONING_START);
    expect(types).toContain(EventType.REASONING_MESSAGE_CONTENT);
    expect(types).toContain(EventType.REASONING_END);
    expect(types).toContain(EventType.TEXT_MESSAGE_START);
    expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT);
    expect(types).toContain(EventType.TOOL_CALL_START);
    expect(types).toContain(EventType.TOOL_CALL_RESULT);
    expect(types).toContain(EventType.CUSTOM);
    expect(types).toContain(EventType.RUN_FINISHED);
    expect(types).toContain(EventType.MESSAGES_SNAPSHOT);

    // Verify snapshot contains messages
    const snapshot = fullEvents.find(e => e.type === EventType.MESSAGES_SNAPSHOT);
    expect(snapshot.messages.length).toBeGreaterThanOrEqual(2); // reasoning + assistant
  });
});

describe("AGUIEventAdapter - Reset", () => {
  test("reset() clears state and generates new IDs", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("ThinkingStarted"));
    const oldThreadId = adapter.getThreadId();

    adapter.reset();
    adapter.process(makeEvent("TextStarted"));
    expect(adapter.getThreadId()).not.toBe(oldThreadId);
  });

  test("clearMessages() removes tracked messages", () => {
    const adapter = new AGUIEventAdapter();
    adapter.process(makeEvent("TextStarted"));
    adapter.process(makeEvent("Text", "hello"));
    adapter.clearMessages();
    expect(adapter.getMessagesSnapshot().messages).toHaveLength(0);
  });
});
