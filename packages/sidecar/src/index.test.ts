import { describe, expect, test, mock, beforeEach } from "bun:test"
import {
  parseStdinInput,
  normalizeSessionId,
  derivePlanSessionId,
  inferProviderId,
  buildToolSuccessResult,
  processAgentEvent,
  SidecarEvent,
} from "./index"

// ─── parseStdinInput (existing) ──────────────────

describe("parseStdinInput", () => {
  test("should parse JSON with messages array (new protocol)", () => {
    const input = JSON.stringify({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      agentMode: "plan",
    })
    const result = parseStdinInput(input)
    expect(result.prompt).toBe("Hello!")
    expect(result.systemMessages).toHaveLength(1)
    expect(result.systemMessages[0].content).toBe("You are a helpful assistant.")
    expect(result.parsedInput.agentMode).toBe("plan")
  })

  test("should fall back to plain text for non-JSON input (legacy protocol)", () => {
    const result = parseStdinInput("Hello agent, do something!")
    expect(result.prompt).toBe("Hello agent, do something!")
    expect(result.systemMessages).toHaveLength(0)
  })

  test("should handle multiple system messages", () => {
    const input = JSON.stringify({
      messages: [
        { role: "system", content: "Rule 1." },
        { role: "system", content: "Rule 2." },
        { role: "user", content: "Hi" },
      ],
    })
    const result = parseStdinInput(input)
    expect(result.systemMessages).toHaveLength(2)
    expect(result.systemMessages[1].content).toBe("Rule 2.")
  })

  test("should handle empty input", () => {
    const result = parseStdinInput("")
    expect(result.prompt).toBe("")
    expect(result.systemMessages).toHaveLength(0)
  })

  test("should handle JSON without messages array (fallback to raw)", () => {
    const input = JSON.stringify({ agentMode: "plan" })
    const result = parseStdinInput(input)
    expect(result.prompt).toBe(input)
  })
})

// ─── normalizeSessionId (existing) ──────────────

describe("normalizeSessionId", () => {
  test("should return undefined for empty input", () => {
    expect(normalizeSessionId()).toBeUndefined()
    expect(normalizeSessionId("")).toBeUndefined()
  })

  test("should add ses_ prefix to raw UUID", () => {
    expect(normalizeSessionId("6a157012-a691-49af-b2ec-c03b79412c61"))
      .toBe("ses_6a157012-a691-49af-b2ec-c03b79412c61")
  })

  test("should NOT add ses_ if already prefixed", () => {
    expect(normalizeSessionId("ses_6a157012-a691-49af-b2ec-c03b79412c61"))
      .toBe("ses_6a157012-a691-49af-b2ec-c03b79412c61")
  })

  test("should pass through if already starting with ses", () => {
    expect(normalizeSessionId("session-existing-123")).toBe("session-existing-123")
  })
})

// ─── derivePlanSessionId (existing) ─────────────

describe("derivePlanSessionId", () => {
  test("should normalize and append --plan suffix", () => {
    expect(derivePlanSessionId("6a157012-a691-49af-b2ec-c03b79412c61"))
      .toBe("ses_6a157012-a691-49af-b2ec-c03b79412c61--plan")
  })

  test("should handle already-normalized ID", () => {
    expect(derivePlanSessionId("ses_valid-id"))
      .toBe("ses_valid-id--plan")
  })

  test("should return undefined for empty input", () => {
    expect(derivePlanSessionId()).toBeUndefined()
    expect(derivePlanSessionId("")).toBeUndefined()
  })
})

// ─── inferProviderId (NEW) ──────────────────────

describe("inferProviderId", () => {
  test("should return 'openai' for gpt models", () => {
    expect(inferProviderId("gpt-4")).toBe("openai")
    expect(inferProviderId("gpt-4-turbo")).toBe("openai")
    expect(inferProviderId("gpt-3.5-turbo")).toBe("openai")
  })

  test("should return 'openai' when model includes 'openai'", () => {
    expect(inferProviderId("openai/gpt-4")).toBe("openai")
  })

  test("should return 'anthropic' for claude models", () => {
    expect(inferProviderId("claude-sonnet-4-20250514")).toBe("anthropic")
    expect(inferProviderId("claude-opus-4-20250514")).toBe("anthropic")
    expect(inferProviderId("claude-haiku")).toBe("anthropic")
  })

  test("should return 'anthropic' when model includes 'anthropic'", () => {
    expect(inferProviderId("anthropic/claude-3-opus")).toBe("anthropic")
  })

  test("should return 'google' for gemini models", () => {
    expect(inferProviderId("gemini-pro")).toBe("google")
    expect(inferProviderId("gemini-ultra")).toBe("google")
  })

  test("should return 'google' when model includes 'google'", () => {
    expect(inferProviderId("google/gemini-pro")).toBe("google")
  })

  test("should return 'deepseek' for deepseek models", () => {
    expect(inferProviderId("deepseek-chat")).toBe("deepseek")
    expect(inferProviderId("deepseek-reasoner")).toBe("deepseek")
  })

  test("should return 'deepseek' by default for unknown models", () => {
    expect(inferProviderId("unknown-model")).toBe("deepseek")
    expect(inferProviderId("")).toBe("deepseek")
  })
})

// ─── buildToolSuccessResult (NEW) ───────────────

describe("buildToolSuccessResult", () => {
  test("should extract result field", () => {
    const data = { result: { content: "file content" } }
    const result = buildToolSuccessResult(data)
    expect(result.content).toBe("file content")
  })

  test("should fallback to structured field", () => {
    const data = { structured: { data: "structured data" } }
    const result = buildToolSuccessResult(data)
    expect(result.data).toBe("structured data")
  })

  test("should merge output field into enriched result", () => {
    const data = { result: { content: "text" }, output: "stdout output" }
    const result = buildToolSuccessResult(data)
    expect(result.content).toBe("text")
    expect(result.output).toBe("stdout output")
  })

  test("should merge diff field from result into enriched result", () => {
    const data = { result: { content: "new", diff: "--- a/file\n+++ b/file" } }
    const result = buildToolSuccessResult(data)
    expect(result.content).toBe("new")
    expect(result.diff).toBe("--- a/file\n+++ b/file")
  })

  test("should handle non-object rawResult (scalar)", () => {
    const data = { result: "just a string" }
    const result = buildToolSuccessResult(data)
    expect(result).toBe("just a string")
  })

  test("should handle empty data", () => {
    const result = buildToolSuccessResult({})
    expect(result).toEqual({})
  })

  test("should handle null/undefined data gracefully", () => {
    const result1 = buildToolSuccessResult(null)
    expect(result1).toEqual({})
    const result2 = buildToolSuccessResult(undefined)
    expect(result2).toEqual({})
  })
})

// ─── processAgentEvent (NEW) ────────────────────

describe("processAgentEvent - Reasoning events", () => {
  const emptyMap = new Map<string, string>()

  test("should process reasoning.started → ThinkingStarted", () => {
    const result = processAgentEvent({ type: "session.next.reasoning.started", data: {} }, emptyMap)
    expect(result).toEqual({ type: "ThinkingStarted", payload: null })
  })

  test("should process reasoning.delta → Thinking with content", () => {
    const result = processAgentEvent({ type: "session.next.reasoning.delta", data: { delta: "thinking..." } }, emptyMap)
    expect(result).toEqual({ type: "Thinking", payload: "thinking..." })
  })

  test("should process reasoning.delta with empty delta", () => {
    const result = processAgentEvent({ type: "session.next.reasoning.delta", data: {} }, emptyMap)
    expect(result).toEqual({ type: "Thinking", payload: "" })
  })

  test("should process reasoning.ended → ThinkingEnded", () => {
    const result = processAgentEvent({ type: "session.next.reasoning.ended", data: {} }, emptyMap)
    expect(result).toEqual({ type: "ThinkingEnded", payload: null })
  })
})

describe("processAgentEvent - Text events", () => {
  const emptyMap = new Map<string, string>()

  test("should process text.started → TextStarted", () => {
    const result = processAgentEvent({ type: "session.next.text.started", data: {} }, emptyMap)
    expect(result).toEqual({ type: "TextStarted", payload: null })
  })

  test("should process text.delta → Text", () => {
    const result = processAgentEvent({ type: "session.next.text.delta", data: { delta: "Hello" } }, emptyMap)
    expect(result).toEqual({ type: "Text", payload: "Hello" })
  })

  test("should process text.ended → TextEnded", () => {
    const result = processAgentEvent({ type: "session.next.text.ended", data: {} }, emptyMap)
    expect(result).toEqual({ type: "TextEnded", payload: null })
  })
})

describe("processAgentEvent - Tool lifecycle events", () => {
  let toolMap: Map<string, string>

  beforeEach(() => {
    toolMap = new Map<string, string>()
  })

  test("should process tool.called → ToolCall and track call_id→name", () => {
    const result = processAgentEvent(
      { type: "session.next.tool.called", data: { callID: "call-1", tool: "bash", input: { command: "ls" } } },
      toolMap,
    ) as SidecarEvent | null
    expect(result?.type).toBe("ToolCall")
    const payload = result!.payload as any
    expect(payload.name).toBe("bash")
    expect(payload.call_id).toBe("call-1")
    expect(payload.args).toBe(JSON.stringify({ command: "ls" }))
    // Should also be in the map
    expect(toolMap.get("call-1")).toBe("bash")
  })

  test("should process tool.started → ToolStarted", () => {
    const result = processAgentEvent(
      { type: "session.next.tool.started", data: { callID: "call-1" } },
      toolMap,
    ) as SidecarEvent | null
    expect(result?.type).toBe("ToolStarted")
    expect((result!.payload as any).call_id).toBe("call-1")
  })

  test("should process tool.success → ToolSuccess with name from map", () => {
    toolMap.set("call-1", "write")
    const data = { callID: "call-1", result: { content: "written" } }
    const result = processAgentEvent(
      { type: "session.next.tool.success", data },
      toolMap,
    ) as SidecarEvent | null
    expect(result?.type).toBe("ToolSuccess")
    const payload = result!.payload as any
    expect(payload.name).toBe("write")
    expect(payload.call_id).toBe("call-1")
    expect(payload.result).toBe(JSON.stringify({ content: "written" }))
  })

  test("should process tool.success with empty name for unknown callID", () => {
    const data = { callID: "unknown-id", result: "done" }
    const result = processAgentEvent(
      { type: "session.next.tool.success", data },
      toolMap,
    ) as SidecarEvent | null
    const payload = result!.payload as any
    expect(payload.name).toBe("")
  })

  test("should process tool.failed → ToolFailed with name from map", () => {
    toolMap.set("call-1", "bash")
    const data = { callID: "call-1", error: { message: "command not found" } }
    const result = processAgentEvent(
      { type: "session.next.tool.failed", data },
      toolMap,
    ) as SidecarEvent | null
    expect(result?.type).toBe("ToolFailed")
    const payload = result!.payload as any
    expect(payload.name).toBe("bash")
    expect(payload.error).toBe("command not found")
    expect(payload.call_id).toBe("call-1")
  })

  test("should process tool.failed with default error message", () => {
    const result = processAgentEvent(
      { type: "session.next.tool.failed", data: { callID: "c1" } },
      toolMap,
    ) as SidecarEvent | null
    expect((result!.payload as any).error).toBe("Execution failed")
  })

  test("should process tool.ended → ToolEnded", () => {
    const result = processAgentEvent(
      { type: "session.next.tool.ended", data: { callID: "call-1" } },
      toolMap,
    ) as SidecarEvent | null
    expect(result?.type).toBe("ToolEnded")
    expect((result!.payload as any).call_id).toBe("call-1")
  })
})

describe("processAgentEvent - Step lifecycle events", () => {
  const emptyMap = new Map<string, string>()

  test("should process step.started → StepStarted", () => {
    const result = processAgentEvent({ type: "session.next.step.started", data: {} }, emptyMap)
    expect(result).toEqual({ type: "StepStarted", payload: null })
  })

  test("should process step.ended → StepEnded", () => {
    const result = processAgentEvent({ type: "session.next.step.ended", data: {} }, emptyMap)
    expect(result).toEqual({ type: "StepEnded", payload: null })
  })
})

describe("processAgentEvent - Error events", () => {
  const emptyMap = new Map<string, string>()

  test("should process error event", () => {
    const result = processAgentEvent(
      { type: "session.next.error", data: { message: "Something went wrong" } },
      emptyMap,
    )
    expect(result).toEqual({ type: "Error", payload: { message: "Something went wrong" } })
  })

  test("should process error with default message", () => {
    const result = processAgentEvent({ type: "session.next.error", data: {} }, emptyMap)
    expect(result).toEqual({ type: "Error", payload: { message: "Unknown error" } })
  })
})

describe("processAgentEvent - Edge cases", () => {
  const emptyMap = new Map<string, string>()

  test("should return null for undefined rawEvent", () => {
    expect(processAgentEvent(undefined, emptyMap)).toBeNull()
  })

  test("should return null for unknown event types", () => {
    const result = processAgentEvent({ type: "unknown.event.type", data: {} }, emptyMap)
    expect(result).toBeNull()
  })

  test("should handle null data gracefully", () => {
    const result = processAgentEvent({ type: "session.next.reasoning.delta", data: null as any }, emptyMap)
    expect(result).toEqual({ type: "Thinking", payload: "" })
  })

  test("should handle empty callID in tool.called", () => {
    const result = processAgentEvent(
      { type: "session.next.tool.called", data: { tool: "bash", input: {} } },
      emptyMap,
    ) as SidecarEvent | null
    expect(result?.type).toBe("ToolCall")
    expect((result!.payload as any).call_id).toBe("")
    // Empty callID should not be tracked
    expect(emptyMap.size).toBe(0)
  })
})
