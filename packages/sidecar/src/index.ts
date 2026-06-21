import { Session } from "../../../../opencode/packages/core/src/session/wrapper"
import path from "path"
import fs from "fs"
import { createInterface } from "readline"

// --- 可测试的工具函数 ---

export interface StdinMessage {
  role: string
  content?: string | null
}

export interface StdinInput {
  messages?: StdinMessage[]
  agentMode?: string | null
}

/** 解析 stdin 输入：尝试 JSON 结构化格式，回退为纯文本 */
export function parseStdinInput(rawInput: string): { prompt: string; systemMessages: StdinMessage[]; parsedInput: StdinInput } {
  const result: { prompt: string; systemMessages: StdinMessage[]; parsedInput: StdinInput } = {
    prompt: rawInput,
    systemMessages: [],
    parsedInput: {},
  }

  if (!rawInput.trim()) return result

  try {
    result.parsedInput = JSON.parse(rawInput)
    if (Array.isArray(result.parsedInput.messages) && result.parsedInput.messages.length > 0) {
      result.systemMessages = result.parsedInput.messages.filter(m => m.role === "system")
      const lastUser = [...result.parsedInput.messages].reverse().find(m => m.role === "user")
      result.prompt = lastUser?.content || ""
    }
  } catch {
    // 非 JSON 即为纯文本格式，prompt 已初始化为 rawInput
  }

  return result
}

/** 归一化 session ID：opencode 要求以 ses 开头 */
export function normalizeSessionId(sessionId?: string): string | undefined {
  if (!sessionId) return undefined
  return sessionId.startsWith("ses") ? sessionId : "ses_" + sessionId
}

/** 派生 plan session ID */
export function derivePlanSessionId(sessionId?: string): string | undefined {
  if (!sessionId) return undefined
  const normalized = normalizeSessionId(sessionId)
  return normalized ? normalized + "--plan" : undefined
}

// --- sidecar 主入口 ---

async function main() {
  try {
    // 1. Read first line from stdin (JSON with messages[] or plain text)
    //    Uses readline for line-by-line protocol to support interactive Q&A
    const rl = createInterface({ input: process.stdin, terminal: false })
    const stdinLines = rl[Symbol.asyncIterator]()

    const firstLine = await stdinLines.next()
    if (firstLine.done || !firstLine.value?.trim()) {
      printEvent({ type: "Error", payload: { message: "Prompt is empty." } })
      process.exit(1)
    }

    // 2. Parse input
    const rawInput = firstLine.value.trim()
    const { prompt, systemMessages, parsedInput } = parseStdinInput(rawInput)

    // 3. Read configuration from environment variables
    const apiKey = process.env.DEEPSEEK_API_KEY || ""
    const modelStr = process.env.OPENCODE_MODEL || "deepseek-chat"
    const directory = process.env.WORKSPACE_PATH || "."
    const sessionId = process.env.OPENCODE_SESSION_ID
    const agentMode = parsedInput.agentMode || process.env.OPENCODE_AGENT_MODE || ""

    if (!prompt) {
      printEvent({ type: "Error", payload: { message: "No user message found in input." } })
      process.exit(1)
    }

    // Map DeepSeek/OpenAI compat API Key to OPENAI_API_KEY
    if (apiKey) {
      process.env.OPENAI_API_KEY = apiKey
    }

    // Parse model string into providerID and id
    let providerID = "deepseek"
    let id = modelStr
    if (modelStr.includes("gpt") || modelStr.includes("openai")) {
      providerID = "openai"
    } else if (modelStr.includes("claude") || modelStr.includes("anthropic")) {
      providerID = "anthropic"
    } else if (modelStr.includes("gemini") || modelStr.includes("google")) {
      providerID = "google"
    }

    const model = { providerID, id }

    // 3b. Write system messages to .opencode/system.md for opencode's runner to pick up
    if (systemMessages.length > 0) {
      const opencodeDir = path.join(directory, ".opencode")
      if (!fs.existsSync(opencodeDir)) fs.mkdirSync(opencodeDir, { recursive: true })
      const systemContent = systemMessages.map(m => m.content || "").filter(Boolean).join("\n")
      fs.writeFileSync(path.join(opencodeDir, "system.md"), systemContent)
    }

    // 3c. Normalize session ID & derive plan session ID
    const effectiveSessionId = agentMode === "plan"
      ? derivePlanSessionId(sessionId)
      : normalizeSessionId(sessionId)

    // 4. Initialize the Session
    console.error(`[sidecar] Initializing session with model: ${JSON.stringify(model)}`)
    const session = await Session.make({
      directory,
      model,
      id: effectiveSessionId || undefined,
      agent: agentMode || undefined
    })

    // 用 callID 映射工具名（opencode 的 success/failed 事件不包含 tool 字段）
    const toolNameByCallID = new Map<string, string>()

    // 4. Run prompt and stream events (with concurrent answer reader for interactive Q&A)
    console.error(`[sidecar] Session ready, starting agent loop (prompt: "${prompt.slice(0, 80)}...")`)

    const onEvent = (raw: any) => {
      const rawEvent = raw.event
      if (!rawEvent) return

      const type = rawEvent.type
      const data = rawEvent.data

      // --- Reasoning blocks ---
      if (type === "session.next.reasoning.started") {
        printEvent({ type: "ThinkingStarted", payload: null })
      } else if (type === "session.next.reasoning.delta") {
        printEvent({ type: "Thinking", payload: data?.delta ?? "" })
      } else if (type === "session.next.reasoning.ended") {
        printEvent({ type: "ThinkingEnded", payload: null })
      }
      // --- Text blocks ---
      else if (type === "session.next.text.started") {
        printEvent({ type: "TextStarted", payload: null })
      } else if (type === "session.next.text.delta") {
        printEvent({ type: "Text", payload: data?.delta ?? "" })
      } else if (type === "session.next.text.ended") {
        printEvent({ type: "TextEnded", payload: null })
      }
      // --- Tool lifecycle ---
      else if (type === "session.next.tool.called") {
        const callID = data?.callID ?? ""
        const toolName = data?.tool ?? ""
        if (callID) toolNameByCallID.set(callID, toolName)
        printEvent({
          type: "ToolCall",
          payload: {
            name: toolName,
            args: JSON.stringify(data?.input ?? {}),
            call_id: callID
          }
        })
      } else if (type === "session.next.tool.started") {
        printEvent({
          type: "ToolStarted",
          payload: { call_id: data?.callID ?? "" }
        })
      } else if (type === "session.next.tool.success") {
        const callID = data?.callID ?? ""
        // 尽量捕获完整的工具结果：result / structured / output / content
        const rawResult = data?.result ?? data?.structured ?? {}
        // 如果 result 是对象，展开合并可能存在的 output / content 字段
        let enriched: any = typeof rawResult === "object" && rawResult !== null ? { ...rawResult } : rawResult
        if (data?.output !== undefined && typeof enriched === "object") {
          enriched.output = data.output
        }
        if (data?.result?.content !== undefined && typeof enriched === "object") {
          enriched.content = data.result.content
        }
        if (data?.result?.diff !== undefined && typeof enriched === "object") {
          enriched.diff = data.result.diff
        }
        printEvent({
          type: "ToolSuccess",
          payload: {
            name: toolNameByCallID.get(callID) ?? "",
            result: JSON.stringify(enriched),
            call_id: callID
          }
        })
      } else if (type === "session.next.tool.failed") {
        const callID = data?.callID ?? ""
        printEvent({
          type: "ToolFailed",
          payload: {
            name: toolNameByCallID.get(callID) ?? "",
            error: data?.error?.message ?? "Execution failed",
            call_id: callID
          }
        })
      } else if (type === "session.next.tool.ended") {
        printEvent({
          type: "ToolEnded",
          payload: { call_id: data?.callID ?? "" }
        })
      }
      // --- Step lifecycle ---
      else if (type === "session.next.step.started") {
        printEvent({ type: "StepStarted", payload: null })
      } else if (type === "session.next.step.ended") {
        printEvent({ type: "StepEnded", payload: null })
      }
      // --- Error events ---
      else if (type === "session.next.error") {
        printEvent({ type: "Error", payload: { message: data?.message ?? "Unknown error" } })
      }
    }

    // 4b. 运行 agent 循环（并发的回答读取器支持交互式 Q&A）
    const promptPromise = session.prompt(prompt, onEvent).finally(() => rl.close())

    // 从 stdin 读取后续行作为用户对 question 工具的回复
    const answerReader = (async () => {
      for await (const line of stdinLines) {
        if (line.trim()) {
          try { await session.respond(line.trim()) }
          catch (_e) { /* respond 失败不影响主流程 */ }
        }
      }
    })()

    await Promise.all([promptPromise, answerReader])

    // 5. 读取 token 用量并通知完成
    let usage: { tokens_input?: number; tokens_output?: number; tokens_reasoning?: number } = {}
    try {
      const Database = (await import("bun:sqlite")).default
      const dbPath = directory + "/.opencode/opencode.db"
      if (fs.existsSync(dbPath)) {
        const db = new Database(dbPath, { readonly: true })
        const lookupId = effectiveSessionId || sessionId || ""
        const row = db.prepare(
          "SELECT tokens_input, tokens_output, tokens_reasoning FROM sessions WHERE id = ?"
        ).get(lookupId) as Record<string, number> | undefined
        if (row) {
          usage = {
            tokens_input: row.tokens_input ?? 0,
            tokens_output: row.tokens_output ?? 0,
            tokens_reasoning: row.tokens_reasoning ?? 0,
          }
        }
        db.close()
      }
    } catch (_e) {
      // token 读取非关键，不影响主流程
    }

    // 5b. 清理 plan 模式生成的临时 session 数据
    if (agentMode === "plan" && effectiveSessionId && effectiveSessionId !== sessionId) {
      try {
        const opencodeDb = path.join(directory, ".opencode", "opencode.db")
        if (fs.existsSync(opencodeDb)) {
          const db = new (await import("bun:sqlite")).default(opencodeDb)
          db.run("DELETE FROM sessions WHERE id = ?", [effectiveSessionId])
          db.run("DELETE FROM messages WHERE session_id = ?", [effectiveSessionId])
          db.run("DELETE FROM events WHERE session_id = ?", [effectiveSessionId])
          db.close()
        }
      } catch (_e2) {
        // 清理非关键，不影响主流程
      }
    }

    if (Object.keys(usage).length > 0) {
      printEvent({ type: "Usage", payload: usage })
    }
    printEvent({ type: "Finished", payload: null })
  } catch (error: any) {
    printEvent({ type: "Error", payload: { message: error.message || String(error) } })
    process.exit(1)
  }
}

function printEvent(evt: { type: string; payload: any }) {
  console.log(JSON.stringify(evt))
}

// 仅在被直接运行时执行 main，被测试导入时不执行
if (import.meta.main) {
  main()
}
