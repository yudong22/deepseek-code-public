//! Protocol layer: AgentEvent types, stdin parsing, and utility functions.
//!
//! This module produces bit-identical JSON output to the TypeScript sidecar
//! (`packages/sidecar/src/index.ts`). All 17 event types are preserved exactly.
//!
//! ## Contract tests (see tests/protocol_contract.rs)
//!
//! The 29 protocol.test.ts tests verify:
//! - stdin JSON parsing with `messages[]` array
//! - Plain text fallback (legacy)
//! - 17 AgentEvent JSON serialization format
//! - env var handling
//! - Exit codes (0 = success, 1 = error)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ─── Stdin Protocol ─────────────────────────────

/// Stdin input: first line JSON structure.
/// Matches `StdinInput` in packages/sidecar/src/index.ts exactly.
#[derive(Debug, Clone, Deserialize)]
pub struct StdinInput {
    pub messages: Option<Vec<StdinMessage>>,
    #[serde(rename = "agentMode")]
    pub agent_mode: Option<String>,
}

/// A single message in the stdin JSON `messages` array.
#[derive(Debug, Clone, Deserialize)]
pub struct StdinMessage {
    pub role: String,
    pub content: Option<String>,
}

/// Parsed stdin result — equivalent to the return of `parseStdinInput()` in TS.
#[derive(Debug, Clone)]
pub struct ParsedInput {
    /// The user prompt string
    pub prompt: String,
    /// System messages extracted from the JSON input
    pub system_messages: Vec<StdinMessage>,
    /// The original parsed input (for agentMode extraction)
    pub parsed_input: StdinInput,
}

/// Parse stdin input: try JSON structured format, fallback to plain text.
///
/// Mirror of `parseStdinInput()` in packages/sidecar/src/index.ts.
pub fn parse_stdin_input(raw_input: &str) -> ParsedInput {
    let trimmed = raw_input.trim();

    if trimmed.is_empty() {
        return ParsedInput {
            prompt: String::new(),
            system_messages: vec![],
            parsed_input: StdinInput {
                messages: None,
                agent_mode: None,
            },
        };
    }

    match serde_json::from_str::<StdinInput>(trimmed) {
        Ok(parsed) => {
            // JSON format
            if let Some(ref messages) = parsed.messages {
                if !messages.is_empty() {
                    let system_messages: Vec<StdinMessage> = messages
                        .iter()
                        .filter(|m| m.role == "system")
                        .cloned()
                        .collect();

                    // Find the last user message
                    let prompt = messages
                        .iter()
                        .rev()
                        .find(|m| m.role == "user")
                        .and_then(|m| m.content.clone())
                        .unwrap_or_default();

                    return ParsedInput {
                        prompt,
                        system_messages,
                        parsed_input: parsed,
                    };
                }
            }
            // JSON without messages array: treat as plain text
            ParsedInput {
                prompt: trimmed.to_string(),
                system_messages: vec![],
                parsed_input: StdinInput {
                    messages: None,
                    agent_mode: None,
                },
            }
        }
        Err(_) => {
            // Not valid JSON: plain text fallback (legacy protocol)
            ParsedInput {
                prompt: trimmed.to_string(),
                system_messages: vec![],
                parsed_input: StdinInput {
                    messages: None,
                    agent_mode: None,
                },
            }
        }
    }
}

// ─── Session ID Helpers ──────────────────────────

/// Normalize session ID: opencode requires IDs to start with `ses_`.
///
/// Mirror of `normalizeSessionId()` in packages/sidecar/src/index.ts.
pub fn normalize_session_id(session_id: Option<&str>) -> Option<String> {
    match session_id {
        None | Some("") => None,
        Some(id) => {
            if id.starts_with("ses") {
                Some(id.to_string())
            } else {
                Some(format!("ses_{}", id))
            }
        }
    }
}

/// Derive plan session ID from a regular session ID.
///
/// Mirror of `derivePlanSessionId()` in packages/sidecar/src/index.ts.
pub fn derive_plan_session_id(session_id: Option<&str>) -> Option<String> {
    let normalized = normalize_session_id(session_id)?;
    Some(format!("{}--plan", normalized))
}

// ─── Provider Inference ──────────────────────────

/// Infer provider ID from model string.
///
/// Mirror of `inferProviderId()` in packages/sidecar/src/index.ts.
pub fn infer_provider_id(model_str: &str) -> &'static str {
    let lower = model_str.to_lowercase();
    if lower.contains("gpt") || lower.contains("openai") {
        "openai"
    } else if lower.contains("claude") || lower.contains("anthropic") {
        "anthropic"
    } else if lower.contains("gemini") || lower.contains("google") {
        "google"
    } else {
        "deepseek"
    }
}

// ─── Tool Result Builder ─────────────────────────

/// Build enriched tool success result, merging result/structured/output/content/diff.
///
/// Supports two input formats:
/// 1. **OpenCode nested format**: `{"result": {...}, "output": "...", ...}`
/// 2. **Rust tool flat format**: `{"stdout": "...", "exit_code": 0}` (used directly)
///
/// Mirror of `buildToolSuccessResult()` in packages/sidecar/src/index.ts,
/// extended to handle flat Rust tool outputs.
pub fn build_tool_success_result(data: &serde_json::Value) -> serde_json::Value {
    // Try opencode nested format first
    let raw_result = data
        .get("result")
        .or_else(|| data.get("structured"));

    match raw_result {
        // Nested format: extract from result/structured field
        Some(inner) => {
            let mut enriched = match inner {
                serde_json::Value::Object(obj) => obj.clone(),
                other => {
                    let mut map = serde_json::Map::new();
                    map.insert("value".to_string(), other.clone());
                    map
                }
            };

            // Merge data.output into enriched.output
            if let Some(output) = data.get("output") {
                enriched.insert("output".to_string(), output.clone());
            }

            // Merge data.result.content into enriched.content
            if let Some(content) = data
                .get("result")
                .and_then(|r| r.get("content"))
            {
                enriched.insert("content".to_string(), content.clone());
            }

            // Merge data.result.diff into enriched.diff
            if let Some(diff) = data
                .get("result")
                .and_then(|r| r.get("diff"))
            {
                enriched.insert("diff".to_string(), diff.clone());
            }

            serde_json::Value::Object(enriched)
        }

        // Flat format: no result/structured wrapper — use the entire data as-is
        None => data.clone(),
    }
}

// ─── AgentEvent Enum ─────────────────────────────

/// The 17 AgentEvent types, exactly matching the TypeScript sidecar's stdout format.
///
/// Uses manual Serialize to ensure unit variants produce `"payload": null`
/// (serde's adjacently-tagged derive skips the payload field for unit variants).
///
/// **IMPORTANT**: This MUST produce identical JSON to the TS sidecar for all
/// 17 types. Any deviation breaks the protocol contract and the AG-UI adapter.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    // ── Reasoning lifecycle (3 variants) ──
    #[serde(rename = "ThinkingStarted")]
    ThinkingStarted,
    #[serde(rename = "Thinking")]
    Thinking(String),
    #[serde(rename = "ThinkingEnded")]
    ThinkingEnded,

    // ── Text lifecycle (3 variants) ──
    #[serde(rename = "TextStarted")]
    TextStarted,
    #[serde(rename = "Text")]
    Text(String),
    #[serde(rename = "TextEnded")]
    TextEnded,

    // ── Tool lifecycle (5 variants) ──
    #[serde(rename = "ToolCall")]
    ToolCall {
        name: String,
        args: String,
        call_id: String,
    },
    #[serde(rename = "ToolStarted")]
    ToolStarted {
        call_id: String,
    },
    #[serde(rename = "ToolSuccess")]
    ToolSuccess {
        name: String,
        result: String,
        call_id: String,
    },
    #[serde(rename = "ToolFailed")]
    ToolFailed {
        name: String,
        error: String,
        call_id: String,
    },
    #[serde(rename = "ToolEnded")]
    ToolEnded {
        call_id: String,
    },

    // ── Step lifecycle (2 variants) ──
    #[serde(rename = "StepStarted")]
    StepStarted,
    #[serde(rename = "StepEnded")]
    StepEnded,

    // ── Terminal events (2 variants) ──
    #[serde(rename = "Finished")]
    Finished,
    #[serde(rename = "Error")]
    Error {
        message: String,
    },

    // ── Usage (1 variant) ──
    #[serde(rename = "Usage")]
    Usage {
        tokens_input: i64,
        tokens_output: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        tokens_reasoning: Option<i64>,
    },
}

impl serde::Serialize for AgentEvent {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;

        let mut map = serializer.serialize_map(Some(2))?;

        match self {
            // ── Reasoning ──
            AgentEvent::ThinkingStarted => {
                map.serialize_entry("type", "ThinkingStarted")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }
            AgentEvent::Thinking(delta) => {
                map.serialize_entry("type", "Thinking")?;
                map.serialize_entry("payload", delta)?;
            }
            AgentEvent::ThinkingEnded => {
                map.serialize_entry("type", "ThinkingEnded")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }

            // ── Text ──
            AgentEvent::TextStarted => {
                map.serialize_entry("type", "TextStarted")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }
            AgentEvent::Text(delta) => {
                map.serialize_entry("type", "Text")?;
                map.serialize_entry("payload", delta)?;
            }
            AgentEvent::TextEnded => {
                map.serialize_entry("type", "TextEnded")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }

            // ── Tool ──
            AgentEvent::ToolCall { name, args, call_id } => {
                map.serialize_entry("type", "ToolCall")?;
                #[derive(Serialize)]
                struct ToolCallPayload<'a> {
                    name: &'a str,
                    args: &'a str,
                    call_id: &'a str,
                }
                map.serialize_entry("payload", &ToolCallPayload { name, args, call_id })?;
            }
            AgentEvent::ToolStarted { call_id } => {
                map.serialize_entry("type", "ToolStarted")?;
                #[derive(Serialize)]
                struct ToolStartedPayload<'a> {
                    call_id: &'a str,
                }
                map.serialize_entry("payload", &ToolStartedPayload { call_id })?;
            }
            AgentEvent::ToolSuccess { name, result, call_id } => {
                map.serialize_entry("type", "ToolSuccess")?;
                #[derive(Serialize)]
                struct ToolSuccessPayload<'a> {
                    name: &'a str,
                    result: &'a str,
                    call_id: &'a str,
                }
                map.serialize_entry("payload", &ToolSuccessPayload { name, result, call_id })?;
            }
            AgentEvent::ToolFailed { name, error, call_id } => {
                map.serialize_entry("type", "ToolFailed")?;
                #[derive(Serialize)]
                struct ToolFailedPayload<'a> {
                    name: &'a str,
                    error: &'a str,
                    call_id: &'a str,
                }
                map.serialize_entry("payload", &ToolFailedPayload { name, error, call_id })?;
            }
            AgentEvent::ToolEnded { call_id } => {
                map.serialize_entry("type", "ToolEnded")?;
                #[derive(Serialize)]
                struct ToolEndedPayload<'a> {
                    call_id: &'a str,
                }
                map.serialize_entry("payload", &ToolEndedPayload { call_id })?;
            }

            // ── Step ──
            AgentEvent::StepStarted => {
                map.serialize_entry("type", "StepStarted")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }
            AgentEvent::StepEnded => {
                map.serialize_entry("type", "StepEnded")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }

            // ── Terminal ──
            AgentEvent::Finished => {
                map.serialize_entry("type", "Finished")?;
                map.serialize_entry("payload", &serde_json::Value::Null)?;
            }
            AgentEvent::Error { message } => {
                map.serialize_entry("type", "Error")?;
                #[derive(Serialize)]
                struct ErrorPayload<'a> {
                    message: &'a str,
                }
                map.serialize_entry("payload", &ErrorPayload { message })?;
            }

            // ── Usage ──
            AgentEvent::Usage { tokens_input, tokens_output, tokens_reasoning } => {
                map.serialize_entry("type", "Usage")?;
                #[derive(Serialize)]
                struct UsagePayload {
                    tokens_input: i64,
                    tokens_output: i64,
                    #[serde(skip_serializing_if = "Option::is_none")]
                    tokens_reasoning: Option<i64>,
                }
                map.serialize_entry("payload", &UsagePayload {
                    tokens_input: *tokens_input,
                    tokens_output: *tokens_output,
                    tokens_reasoning: *tokens_reasoning,
                })?;
            }
        }

        map.end()
    }
}

impl AgentEvent {
    /// Serialize this event as a JSON line (including trailing newline).
    /// This is the exact format written to stdout by the TypeScript sidecar.
    pub fn to_json_line(&self) -> Result<String, serde_json::Error> {
        let json = serde_json::to_string(self)?;
        Ok(format!("{}\n", json))
    }
}

// ─── Event Routing ───────────────────────────────

/// Represents an opencode internal event (the .event field from the Session callback).
/// This is the Rust equivalent of `{ type: string; data: any }` in the TS sidecar.
#[derive(Debug, Clone)]
pub struct RawAgentEvent {
    pub event_type: String,
    pub data: serde_json::Value,
}

/// Process a raw opencode event into a sidecar AgentEvent.
///
/// Mirror of `processAgentEvent()` in packages/sidecar/src/index.ts.
/// Maintains a `call_id -> tool_name` mapping for ToolSuccess/ToolFailed lookup.
pub fn process_agent_event(
    raw: Option<&RawAgentEvent>,
    tool_name_by_call_id: &mut HashMap<String, String>,
) -> Option<AgentEvent> {
    let event = raw?;
    let event_type = event.event_type.as_str();
    let data = &event.data;

    match event_type {
        // ── Reasoning blocks ──
        "session.next.reasoning.started" => Some(AgentEvent::ThinkingStarted),
        "session.next.reasoning.delta" => {
            let delta = data
                .get("delta")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(AgentEvent::Thinking(delta))
        }
        "session.next.reasoning.ended" => Some(AgentEvent::ThinkingEnded),

        // ── Text blocks ──
        "session.next.text.started" => Some(AgentEvent::TextStarted),
        "session.next.text.delta" => {
            let delta = data
                .get("delta")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(AgentEvent::Text(delta))
        }
        "session.next.text.ended" => Some(AgentEvent::TextEnded),

        // ── Tool lifecycle ──
        "session.next.tool.called" => {
            let call_id = data
                .get("callID")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let tool_name = data
                .get("tool")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            if !call_id.is_empty() {
                tool_name_by_call_id.insert(call_id.clone(), tool_name.clone());
            }

            let args = data
                .get("input")
                .map(|v| serde_json::to_string(v).unwrap_or_default())
                .unwrap_or_else(|| "{}".to_string());

            Some(AgentEvent::ToolCall {
                name: tool_name,
                args,
                call_id,
            })
        }
        "session.next.tool.started" => {
            let call_id = data
                .get("callID")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(AgentEvent::ToolStarted { call_id })
        }
        "session.next.tool.success" => {
            let call_id = data
                .get("callID")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let enriched = build_tool_success_result(data);
            let result = serde_json::to_string(&enriched).unwrap_or_default();
            let name = tool_name_by_call_id
                .get(&call_id)
                .cloned()
                .unwrap_or_default();
            Some(AgentEvent::ToolSuccess {
                name,
                result,
                call_id,
            })
        }
        "session.next.tool.failed" => {
            let call_id = data
                .get("callID")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let error_msg = data
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("Execution failed")
                .to_string();
            let name = tool_name_by_call_id
                .get(&call_id)
                .cloned()
                .unwrap_or_default();
            Some(AgentEvent::ToolFailed {
                name,
                error: error_msg,
                call_id,
            })
        }
        "session.next.tool.ended" => {
            let call_id = data
                .get("callID")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(AgentEvent::ToolEnded { call_id })
        }

        // ── Step lifecycle ──
        "session.next.step.started" => Some(AgentEvent::StepStarted),
        "session.next.step.ended" => Some(AgentEvent::StepEnded),

        // ── Error events ──
        "session.next.error" => {
            let message = data
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error")
                .to_string();
            Some(AgentEvent::Error { message })
        }

        // Unknown events are silently dropped (matching TS behavior)
        _ => None,
    }
}

// ─── Tests ───────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── parse_stdin_input tests (matches index.test.ts) ───

    mod parse_stdin_input {
        use super::*;

        #[test]
        fn json_with_messages_and_system_prompt() {
            let input = r#"{"messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"Write hello world"}]}"#;
            let result = parse_stdin_input(input);

            assert_eq!(result.prompt, "Write hello world");
            assert_eq!(result.system_messages.len(), 1);
            assert_eq!(result.system_messages[0].role, "system");
            assert_eq!(
                result.system_messages[0].content.as_deref(),
                Some("You are a helpful assistant.")
            );
        }

        #[test]
        fn json_with_agent_mode() {
            let input = r#"{"messages":[{"role":"user","content":"plan this"}],"agentMode":"plan"}"#;
            let result = parse_stdin_input(input);

            assert_eq!(result.prompt, "plan this");
            assert_eq!(result.parsed_input.agent_mode.as_deref(), Some("plan"));
        }

        #[test]
        fn json_with_multiple_system_messages() {
            let input = r#"{"messages":[{"role":"system","content":"Rule A"},{"role":"system","content":"Rule B"},{"role":"user","content":"do it"}]}"#;
            let result = parse_stdin_input(input);

            assert_eq!(result.system_messages.len(), 2);
            assert_eq!(result.prompt, "do it");
        }

        #[test]
        fn plain_text_fallback() {
            let input = "Write hello world";
            let result = parse_stdin_input(input);

            assert_eq!(result.prompt, "Write hello world");
            assert!(result.system_messages.is_empty());
        }

        #[test]
        fn empty_input() {
            let result = parse_stdin_input("");
            assert_eq!(result.prompt, "");
            assert!(result.system_messages.is_empty());

            let result2 = parse_stdin_input("   ");
            assert_eq!(result2.prompt, "");
            assert!(result2.system_messages.is_empty());
        }

        #[test]
        fn json_without_messages_field() {
            let input = r#"{"something": "else"}"#;
            let result = parse_stdin_input(input);
            // JSON without messages array => treat as plain text
            assert_eq!(result.prompt, input);
        }

        #[test]
        fn json_with_empty_messages_array() {
            let input = r#"{"messages":[]}"#;
            let result = parse_stdin_input(input);
            // Empty messages => treat as plain text (no user message found)
            assert_eq!(result.prompt, input);
        }
    }

    // ─── normalize_session_id tests ───

    mod normalize_session_id {
        use super::*;

        #[test]
        fn none_returns_none() {
            assert_eq!(normalize_session_id(None), None);
        }

        #[test]
        fn empty_returns_none() {
            assert_eq!(normalize_session_id(Some("")), None);
        }

        #[test]
        fn already_prefixed() {
            let result = normalize_session_id(Some("ses_abc123"));
            assert_eq!(result.as_deref(), Some("ses_abc123"));
        }

        #[test]
        fn adds_prefix() {
            let result = normalize_session_id(Some("abc123"));
            assert_eq!(result.as_deref(), Some("ses_abc123"));
        }

        #[test]
        fn starts_with_ses_but_not_prefixed() {
            // "session-1" starts with "ses" so it's kept as-is per TS behavior
            let result = normalize_session_id(Some("session-1"));
            assert_eq!(result.as_deref(), Some("session-1"));
        }
    }

    // ─── derive_plan_session_id tests ───

    mod derive_plan_session_id {
        use super::*;

        #[test]
        fn none_returns_none() {
            assert_eq!(derive_plan_session_id(None), None);
        }

        #[test]
        fn valid_id_appends_plan_suffix() {
            let result = derive_plan_session_id(Some("abc123"));
            assert_eq!(result.as_deref(), Some("ses_abc123--plan"));
        }

        #[test]
        fn already_normalized_id() {
            let result = derive_plan_session_id(Some("ses_xyz"));
            assert_eq!(result.as_deref(), Some("ses_xyz--plan"));
        }
    }

    // ─── infer_provider_id tests ───

    mod infer_provider_id {
        use super::*;

        #[test]
        fn gpt_models() {
            assert_eq!(infer_provider_id("gpt-4"), "openai");
            assert_eq!(infer_provider_id("gpt-4o-mini"), "openai");
            assert_eq!(infer_provider_id("openai/gpt-4"), "openai");
        }

        #[test]
        fn claude_models() {
            assert_eq!(infer_provider_id("claude-sonnet-4-20250514"), "anthropic");
            assert_eq!(infer_provider_id("claude-haiku"), "anthropic");
            assert_eq!(infer_provider_id("anthropic/claude-opus"), "anthropic");
        }

        #[test]
        fn gemini_models() {
            assert_eq!(infer_provider_id("gemini-2.5-flash"), "google");
            assert_eq!(infer_provider_id("gemini-pro"), "google");
            assert_eq!(infer_provider_id("google/gemini-flash"), "google");
        }

        #[test]
        fn deepseek_default() {
            assert_eq!(infer_provider_id("deepseek-chat"), "deepseek");
            assert_eq!(infer_provider_id("deepseek-reasoner"), "deepseek");
            assert_eq!(infer_provider_id("deepseek/deepseek-v4-flash"), "deepseek");
        }

        #[test]
        fn unknown_models_default_to_deepseek() {
            assert_eq!(infer_provider_id("unknown-model"), "deepseek");
            assert_eq!(infer_provider_id(""), "deepseek");
        }
    }

    // ─── build_tool_success_result tests ───

    mod build_tool_success_result {
        use super::*;

        #[test]
        fn simple_result() {
            let data = serde_json::json!({
                "result": {"status": "ok", "count": 42}
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["status"], "ok");
            assert_eq!(result["count"], 42);
        }

        #[test]
        fn merges_output_field() {
            let data = serde_json::json!({
                "result": {"status": "ok"},
                "output": "Hello stdout"
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["status"], "ok");
            assert_eq!(result["output"], "Hello stdout");
        }

        #[test]
        fn merges_content_from_result() {
            let data = serde_json::json!({
                "result": {
                    "content": "file contents here",
                    "status": "ok"
                }
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["content"], "file contents here");
            assert_eq!(result["status"], "ok");
        }

        #[test]
        fn merges_diff_from_result() {
            let data = serde_json::json!({
                "result": {
                    "diff": "--- a/file\n+++ b/file",
                    "status": "ok"
                }
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["diff"], "--- a/file\n+++ b/file");
            assert_eq!(result["status"], "ok");
        }

        #[test]
        fn falls_back_to_structured() {
            let data = serde_json::json!({
                "structured": {"status": "ok"}
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["status"], "ok");
        }

        #[test]
        fn scalar_result_wrapped_in_value() {
            let data = serde_json::json!({
                "result": 42
            });
            let result = build_tool_success_result(&data);
            // Scalar result is wrapped in {"value": 42}
            assert_eq!(result["value"], 42);
        }

        #[test]
        fn null_data_handled_gracefully() {
            let data = serde_json::json!({});
            let result = build_tool_success_result(&data);
            assert!(result.as_object().unwrap().is_empty());
        }

        #[test]
        fn flat_rust_tool_output_preserved() {
            // Rust 工具返回的扁平格式：直接保留全部字段
            let data = serde_json::json!({
                "stdout": "file1.txt\nfile2.txt\n",
                "stderr": "",
                "exit_code": 0
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["stdout"], "file1.txt\nfile2.txt\n");
            assert_eq!(result["stderr"], "");
            assert_eq!(result["exit_code"], 0);
        }

        #[test]
        fn flat_rust_tool_output_with_error() {
            let data = serde_json::json!({
                "stdout": "",
                "stderr": "bash: nonexistent: command not found\n",
                "exit_code": 127
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["exit_code"], 127);
            assert!(result["stderr"].as_str().unwrap().contains("not found"));
        }

        #[test]
        fn flat_file_read_output_preserved() {
            let data = serde_json::json!({
                "content": "line1\nline2\nline3",
                "total_lines": 3,
                "offset": 1,
                "lines_read": 3
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["content"], "line1\nline2\nline3");
            assert_eq!(result["total_lines"], 3);
        }

        #[test]
        fn merges_all_fields_together() {
            let data = serde_json::json!({
                "result": {
                    "content": "hello",
                    "diff": "+world",
                    "status": "ok"
                },
                "output": "stdout text",
                "structured": {"should_not_appear": "because result exists"}
            });
            let result = build_tool_success_result(&data);
            assert_eq!(result["content"], "hello");
            assert_eq!(result["diff"], "+world");
            assert_eq!(result["status"], "ok");
            assert_eq!(result["output"], "stdout text");
            // structured is NOT used because result exists
            assert!(result.get("should_not_appear").is_none());
        }
    }

    // ─── AgentEvent serialization tests ───

    mod agent_event_serialization {
        use super::*;

        #[test]
        fn thinking_started_is_null_payload() {
            let json = AgentEvent::ThinkingStarted.to_json_line().unwrap();
            assert_eq!(json, concat!(r#"{"type":"ThinkingStarted","payload":null}"#, "\n"));
        }

        #[test]
        fn thinking_delta_is_string_payload() {
            let json = AgentEvent::Thinking("some thought".to_string())
                .to_json_line()
                .unwrap();
            assert_eq!(
                json,
                concat!(r#"{"type":"Thinking","payload":"some thought"}"#, "\n")
            );
        }

        #[test]
        fn tool_call_has_all_fields() {
            let json = AgentEvent::ToolCall {
                name: "bash".to_string(),
                args: r#"{"command":"ls"}"#.to_string(),
                call_id: "call_1".to_string(),
            }
            .to_json_line()
            .unwrap();
            let parsed: serde_json::Value =
                serde_json::from_str(&json).expect("valid JSON");
            let payload = &parsed["payload"];
            assert_eq!(payload["name"], "bash");
            assert_eq!(payload["call_id"], "call_1");
            assert!(payload["args"].as_str().unwrap().contains("command"));
        }

        #[test]
        fn tool_success_has_all_fields() {
            let json = AgentEvent::ToolSuccess {
                name: "file_read".to_string(),
                result: r#"{"content":"hello"}"#.to_string(),
                call_id: "call_2".to_string(),
            }
            .to_json_line()
            .unwrap();
            let parsed: serde_json::Value =
                serde_json::from_str(&json).expect("valid JSON");
            let payload = &parsed["payload"];
            assert_eq!(payload["name"], "file_read");
            assert_eq!(payload["call_id"], "call_2");
            assert!(payload["result"].as_str().unwrap().contains("hello"));
        }

        #[test]
        fn usage_without_reasoning_tokens() {
            let json = AgentEvent::Usage {
                tokens_input: 100,
                tokens_output: 50,
                tokens_reasoning: None,
            }
            .to_json_line()
            .unwrap();
            let parsed: serde_json::Value =
                serde_json::from_str(&json).expect("valid JSON");
            let payload = &parsed["payload"];
            assert_eq!(payload["tokens_input"], 100);
            assert_eq!(payload["tokens_output"], 50);
            assert!(payload.get("tokens_reasoning").is_none());
        }

        #[test]
        fn usage_with_reasoning_tokens() {
            let json = AgentEvent::Usage {
                tokens_input: 200,
                tokens_output: 80,
                tokens_reasoning: Some(500),
            }
            .to_json_line()
            .unwrap();
            let parsed: serde_json::Value =
                serde_json::from_str(&json).expect("valid JSON");
            let payload = &parsed["payload"];
            assert_eq!(payload["tokens_reasoning"], 500);
        }

        #[test]
        fn finished_is_null_payload() {
            let json = AgentEvent::Finished.to_json_line().unwrap();
            assert_eq!(json, concat!(r#"{"type":"Finished","payload":null}"#, "\n"));
        }

        #[test]
        fn error_has_message() {
            let json = AgentEvent::Error {
                message: "something went wrong".to_string(),
            }
            .to_json_line()
            .unwrap();
            let parsed: serde_json::Value =
                serde_json::from_str(&json).expect("valid JSON");
            assert_eq!(parsed["payload"]["message"], "something went wrong");
        }

        #[test]
        fn all_17_types_serialize_to_valid_json() {
            // Verify every variant produces parseable JSON
            let events = vec![
                AgentEvent::ThinkingStarted,
                AgentEvent::Thinking("t".to_string()),
                AgentEvent::ThinkingEnded,
                AgentEvent::TextStarted,
                AgentEvent::Text("text".to_string()),
                AgentEvent::TextEnded,
                AgentEvent::ToolCall {
                    name: "t".to_string(),
                    args: "{}".to_string(),
                    call_id: "c1".to_string(),
                },
                AgentEvent::ToolStarted {
                    call_id: "c1".to_string(),
                },
                AgentEvent::ToolSuccess {
                    name: "t".to_string(),
                    result: "{}".to_string(),
                    call_id: "c1".to_string(),
                },
                AgentEvent::ToolFailed {
                    name: "t".to_string(),
                    error: "e".to_string(),
                    call_id: "c1".to_string(),
                },
                AgentEvent::ToolEnded {
                    call_id: "c1".to_string(),
                },
                AgentEvent::StepStarted,
                AgentEvent::StepEnded,
                AgentEvent::Finished,
                AgentEvent::Error {
                    message: "err".to_string(),
                },
                AgentEvent::Usage {
                    tokens_input: 1,
                    tokens_output: 2,
                    tokens_reasoning: Some(3),
                },
            ];

            for event in &events {
                let json = event.to_json_line().unwrap();
                let _: serde_json::Value =
                    serde_json::from_str(&json).expect(&format!(
                        "Failed to parse: {:?}",
                        json
                    ));
            }
        }
    }

    // ─── process_agent_event tests ───

    mod process_agent_event {
        use super::*;

        #[test]
        fn thinking_started() {
            let raw = RawAgentEvent {
                event_type: "session.next.reasoning.started".to_string(),
                data: serde_json::json!({}),
            };
            let result = process_agent_event(Some(&raw), &mut HashMap::new());
            assert!(matches!(result, Some(AgentEvent::ThinkingStarted)));
        }

        #[test]
        fn thinking_delta_extracts_text() {
            let raw = RawAgentEvent {
                event_type: "session.next.reasoning.delta".to_string(),
                data: serde_json::json!({"delta": "I need to think about this"}),
            };
            let result = process_agent_event(Some(&raw), &mut HashMap::new());
            match result {
                Some(AgentEvent::Thinking(text)) => {
                    assert_eq!(text, "I need to think about this");
                }
                _ => panic!("Expected Thinking event"),
            }
        }

        #[test]
        fn thinking_delta_empty_if_missing() {
            let raw = RawAgentEvent {
                event_type: "session.next.reasoning.delta".to_string(),
                data: serde_json::json!({}),
            };
            let result = process_agent_event(Some(&raw), &mut HashMap::new());
            match result {
                Some(AgentEvent::Thinking(text)) => {
                    assert_eq!(text, "");
                }
                _ => panic!("Expected Thinking event"),
            }
        }

        #[test]
        fn tool_call_tracks_name_and_emits_event() {
            let mut map = HashMap::new();
            let raw = RawAgentEvent {
                event_type: "session.next.tool.called".to_string(),
                data: serde_json::json!({
                    "callID": "call_abc",
                    "tool": "bash",
                    "input": {"command": "ls -la"}
                }),
            };
            let result = process_agent_event(Some(&raw), &mut map);

            match result {
                Some(AgentEvent::ToolCall {
                    name,
                    args,
                    call_id,
                }) => {
                    assert_eq!(name, "bash");
                    assert_eq!(call_id, "call_abc");
                    assert!(args.contains("ls"));
                }
                _ => panic!("Expected ToolCall event"),
            }

            // Verify the callID was tracked
            assert_eq!(map.get("call_abc").unwrap(), "bash");
        }

        #[test]
        fn tool_success_looks_up_name() {
            let mut map = HashMap::new();
            map.insert("call_xyz".to_string(), "file_read".to_string());

            let raw = RawAgentEvent {
                event_type: "session.next.tool.success".to_string(),
                data: serde_json::json!({
                    "callID": "call_xyz",
                    "result": {"content": "file contents", "status": "ok"}
                }),
            };
            let result = process_agent_event(Some(&raw), &mut map);

            match result {
                Some(AgentEvent::ToolSuccess {
                    name,
                    result: result_str,
                    call_id,
                }) => {
                    assert_eq!(name, "file_read");
                    assert_eq!(call_id, "call_xyz");
                    assert!(result_str.contains("file contents"));
                }
                _ => panic!("Expected ToolSuccess event"),
            }
        }

        #[test]
        fn tool_failed_extracts_error_message() {
            let mut map = HashMap::new();
            map.insert("call_err".to_string(), "grep".to_string());

            let raw = RawAgentEvent {
                event_type: "session.next.tool.failed".to_string(),
                data: serde_json::json!({
                    "callID": "call_err",
                    "error": {"message": "Pattern not found"}
                }),
            };
            let result = process_agent_event(Some(&raw), &mut map);

            match result {
                Some(AgentEvent::ToolFailed {
                    name,
                    error,
                    call_id,
                }) => {
                    assert_eq!(name, "grep");
                    assert_eq!(call_id, "call_err");
                    assert_eq!(error, "Pattern not found");
                }
                _ => panic!("Expected ToolFailed event"),
            }
        }

        #[test]
        fn tool_failed_default_error_message() {
            let mut map = HashMap::new();
            map.insert("call_no_err".to_string(), "bash".to_string());

            let raw = RawAgentEvent {
                event_type: "session.next.tool.failed".to_string(),
                data: serde_json::json!({
                    "callID": "call_no_err"
                }),
            };
            let result = process_agent_event(Some(&raw), &mut map);

            match result {
                Some(AgentEvent::ToolFailed { error, .. }) => {
                    assert_eq!(error, "Execution failed");
                }
                _ => panic!("Expected ToolFailed event"),
            }
        }

        #[test]
        fn unknown_event_returns_null() {
            let raw = RawAgentEvent {
                event_type: "some.unknown.event".to_string(),
                data: serde_json::json!({}),
            };
            let result = process_agent_event(Some(&raw), &mut HashMap::new());
            assert!(result.is_none());
        }

        #[test]
        fn none_input_returns_null() {
            let result = process_agent_event(None, &mut HashMap::new());
            assert!(result.is_none());
        }

        #[test]
        fn step_started_and_ended() {
            let raw_start = RawAgentEvent {
                event_type: "session.next.step.started".to_string(),
                data: serde_json::json!({}),
            };
            let result = process_agent_event(Some(&raw_start), &mut HashMap::new());
            assert!(matches!(result, Some(AgentEvent::StepStarted)));

            let raw_end = RawAgentEvent {
                event_type: "session.next.step.ended".to_string(),
                data: serde_json::json!({}),
            };
            let result = process_agent_event(Some(&raw_end), &mut HashMap::new());
            assert!(matches!(result, Some(AgentEvent::StepEnded)));
        }

        #[test]
        fn error_event_extracts_message() {
            let raw = RawAgentEvent {
                event_type: "session.next.error".to_string(),
                data: serde_json::json!({"message": "LLM API timeout"}),
            };
            let result = process_agent_event(Some(&raw), &mut HashMap::new());
            match result {
                Some(AgentEvent::Error { message }) => {
                    assert_eq!(message, "LLM API timeout");
                }
                _ => panic!("Expected Error event"),
            }
        }

        #[test]
        fn tool_ended_extracts_call_id() {
            let raw = RawAgentEvent {
                event_type: "session.next.tool.ended".to_string(),
                data: serde_json::json!({"callID": "call_done"}),
            };
            let result = process_agent_event(Some(&raw), &mut HashMap::new());
            match result {
                Some(AgentEvent::ToolEnded { call_id }) => {
                    assert_eq!(call_id, "call_done");
                }
                _ => panic!("Expected ToolEnded event"),
            }
        }
    }
}
