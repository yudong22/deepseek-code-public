import { Session } from "../../opencode/packages/core/src/session/wrapper"
import fs from "fs"

async function main() {
  try {
    // 1. Read prompt from stdin until EOF
    const prompt = fs.readFileSync(0, "utf-8").trim()
    if (!prompt) {
      printEvent({ type: "Error", payload: "Prompt is empty." })
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

    // 4. Run prompt and stream events
    await session.prompt(prompt, (event) => {
      const rawEvent = event.event
      if (!rawEvent) return

      if (rawEvent.type === "session.next.reasoning.delta") {
        printEvent({ type: "Thinking", payload: rawEvent.data?.delta })
      } else if (rawEvent.type === "session.next.text.delta") {
        printEvent({ type: "Text", payload: rawEvent.data?.delta })
      } else if (rawEvent.type === "session.next.tool.called") {
        printEvent({
          type: "ToolCall",
          payload: {
            name: rawEvent.data?.tool,
            args: JSON.stringify(rawEvent.data?.input)
          }
        })
      } else if (rawEvent.type === "session.next.tool.success") {
        printEvent({
          type: "ToolResult",
          payload: {
            name: rawEvent.data?.tool,
            result: JSON.stringify(rawEvent.data?.result || rawEvent.data?.structured || {})
          }
        })
      } else if (rawEvent.type === "session.next.tool.failed") {
        printEvent({
          type: "ToolResult",
          payload: {
            name: rawEvent.data?.tool,
            result: JSON.stringify({ error: rawEvent.data?.error?.message || "Execution failed" })
          }
        })
      }
    })

    // 5. Notify completion
    printEvent({ type: "Finished", payload: null })
  } catch (error: any) {
    printEvent({ type: "Error", payload: error.message || String(error) })
    process.exit(1)
  }
}

function printEvent(evt: { type: string; payload: any }) {
  console.log(JSON.stringify(evt))
}

main()
