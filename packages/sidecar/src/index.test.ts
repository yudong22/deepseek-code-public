import { describe, expect, test } from "bun:test"
import { parseStdinInput, normalizeSessionId, derivePlanSessionId } from "./index"

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
    expect(result.prompt).toBe(input) // no messages[] → raw text fallback
  })
})

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
