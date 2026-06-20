import { Session } from "../../opencode/packages/core/src/session/wrapper"
import fs from "fs"

async function main() {
  try {
    // 1. Read prompt from stdin until EOF
    const prompt = fs.readFileSync(0, "utf-8").trim()
    if (!prompt) {
      printEvent({ type: "Error", payload: { message: "Prompt is empty." } })
      process.exit(1)
    }

    // 2. Read configuration from environment variables
    const apiKey = process.env.DEEPSEEK_API_KEY || ""
    const modelStr = process.env.OPENCODE_MODEL || "deepseek-chat"
    const directory = process.env.WORKSPACE_PATH || "."
    const sessionId = process.env.OPENCODE_SESSION_ID

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

    // 3. Initialize the Session
    const session = await Session.make({
      directory,
      model,
      id: sessionId || undefined
    })

    // 用 callID 映射工具名（opencode 的 success/failed 事件不包含 tool 字段）
    const toolNameByCallID = new Map<string, string>()

    // 4. Run prompt and stream events
    await session.prompt(prompt, (raw) => {
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
        printEvent({
          type: "ToolSuccess",
          payload: {
            name: toolNameByCallID.get(callID) ?? "",
            result: JSON.stringify(data?.result ?? data?.structured ?? {}),
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
    })

    // 5. Notify completion
    printEvent({ type: "Finished", payload: null })
  } catch (error: any) {
    printEvent({ type: "Error", payload: { message: error.message || String(error) } })
    process.exit(1)
  }
}

function printEvent(evt: { type: string; payload: any }) {
  console.log(JSON.stringify(evt))
}

main()
