//! LLM provider layer: SSE streaming, provider config, chunk parsing.
//!
//! All 4 providers (DeepSeek, OpenAI, Anthropic, Google) use the same
//! OpenAI-compatible `/v1/chat/completions` endpoint with `stream: true`.
//!
//! This module handles:
//! - Building HTTP requests with proper auth headers
//! - Parsing SSE byte streams into structured `SseChunk` events
//! - Accumulating tool call argument deltas across multiple chunks
//! - Tracking reasoning state boundaries

use crate::protocol::infer_provider_id;
use futures::Stream;
use serde::Serialize;
use std::pin::Pin;
use std::time::Duration;

// ─── Provider Configuration ──────────────────────

/// Configuration for an LLM provider endpoint.
#[derive(Debug, Clone)]
pub struct ProviderConfig {
    /// Full URL including path, e.g., `https://api.deepseek.com/v1/chat/completions`
    pub endpoint_url: String,
    /// API key (Bearer token)
    pub api_key: String,
    /// Model identifier, e.g., `deepseek-chat`
    pub model: String,
}

/// Build a ProviderConfig from a model string and API key.
///
/// Maps model names to provider-specific endpoints using `infer_provider_id()`.
/// All providers use OpenAI-compatible `/chat/completions` endpoints.
pub fn config_for_model(model: &str, api_key: &str) -> ProviderConfig {
    let provider = infer_provider_id(model);
    let base_url = match provider {
        "openai" => "https://api.openai.com/v1",
        "anthropic" => "https://api.anthropic.com/v1",
        "google" => "https://generativelanguage.googleapis.com/v1beta/openai",
        _ => "https://api.deepseek.com/v1", // deepseek + fallback
    };

    ProviderConfig {
        endpoint_url: format!("{}/chat/completions", base_url),
        api_key: api_key.to_string(),
        model: model.to_string(),
    }
}

// ─── Chat Message ────────────────────────────────

/// A message in the chat completion request.
#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    /// Required for `role: "tool"` messages (maps to the tool call this result answers)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    /// Required for `role: "assistant"` messages that invoke tools
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCallDef>>,
}

/// A tool call in an assistant message (for conversation history).
///
/// **WARNING**: This is DIFFERENT from `ToolDef` (tool definitions in the `tools` array).
/// - `ToolDef.function.parameters` = JSON Schema **object** (for API tool definitions)
/// - `ToolCallDef.function.arguments` = JSON **string** (for conversation tool calls)
#[derive(Debug, Clone, Serialize)]
pub struct ToolCallDef {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: ToolCallFunctionDef,
}

/// Function info within a tool CALL (assistant message history).
/// Uses `arguments: String` (JSON-encoded tool args), NOT `parameters: Value`.
#[derive(Debug, Clone, Serialize)]
pub struct ToolCallFunctionDef {
    pub name: String,
    /// JSON string of the tool arguments (e.g., `"{\"command\": \"ls\"}"`)
    pub arguments: String,
}

/// A tool definition for the `tools` array in the request.
#[derive(Debug, Clone, Serialize)]
pub struct ToolDef {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: FunctionDef,
}

/// Function info within a tool DEFINITION (the `tools` array).
/// Uses `parameters: Value` (JSON Schema object), NOT `arguments: String`.
#[derive(Debug, Clone, Serialize)]
pub struct FunctionDef {
    pub name: String,
    pub description: String,
    /// JSON Schema object describing the tool's input parameters
    pub parameters: serde_json::Value,
}

/// The request body for `/v1/chat/completions`.
#[derive(Debug, Serialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub stream: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ToolDef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
}

// ─── SSE Chunk Types ─────────────────────────────

/// Parsed SSE chunk events emitted by the streaming parser.
///
/// These represent the semantic events derived from raw OpenAI-compatible
/// streaming chat completion chunks (SSE `data:` lines).
#[derive(Debug, Clone)]
pub enum SseChunk {
    /// Reasoning/thinking block starts
    ReasoningStart,
    /// Reasoning content delta
    ReasoningDelta {
        delta: String,
    },
    /// Reasoning block ends
    ReasoningEnd,

    /// Text response block starts
    TextStart,
    /// Text content delta
    TextDelta {
        delta: String,
    },
    /// Text response block ends
    TextEnd,

    /// Tool call starts (may have partial args; args complete in ToolCallEnd)
    ToolCallStart {
        id: String,
        name: String,
    },
    /// Accumulated complete tool call
    ToolCallEnd {
        id: String,
        name: String,
        args: String, // JSON string of complete arguments
    },

    /// Token usage from the final chunk
    Usage {
        input: u64,
        output: u64,
        reasoning: u64,
    },

    /// An error occurred during streaming
    Error {
        message: String,
    },
}

// ─── Streaming Parser ────────────────────────────

/// State for the SSE chunk parser (tracks reasoning/text boundaries and tool call accumulation).
struct ParserState {
    /// Whether reasoning is currently in progress
    reasoning_active: bool,
    /// Whether text response is currently in progress
    text_active: bool,
    /// Accumulated tool calls: index → {id, name, args_buffer}
    tool_call_buffers: std::collections::HashMap<i64, ToolCallBuffer>,
}

struct ToolCallBuffer {
    id: String,
    name: String,
    args_buffer: String,
}

impl ParserState {
    fn new() -> Self {
        Self {
            reasoning_active: false,
            text_active: false,
            tool_call_buffers: std::collections::HashMap::new(),
        }
    }
}

/// Parse a raw SSE event string (`data: {...}`) into zero or more `SseChunk` events.
///
/// Handles the OpenAI streaming format where:
/// - `choices[0].delta.content` → text delta
/// - `choices[0].delta.reasoning_content` → reasoning delta
/// - `choices[0].delta.tool_calls` → tool call fragments
/// - `choices[0].finish_reason` → signals end of text or tool call accumulation
/// - `usage` → token usage (in final chunk)
fn parse_sse_data(data_str: &str, state: &mut ParserState) -> Vec<SseChunk> {
    let mut chunks = Vec::new();

    // Handle `[DONE]` sentinel
    let trimmed = data_str.trim();
    if trimmed.is_empty() || trimmed == "[DONE]" {
        return chunks;
    }

    let parsed: serde_json::Value = match serde_json::from_str(trimmed) {
        Ok(v) => v,
        Err(_) => {
            chunks.push(SseChunk::Error {
                message: format!("Failed to parse SSE JSON: {}", &trimmed[..trimmed.len().min(200)]),
            });
            return chunks;
        }
    };

    // Extract choices array
    let choices = match parsed.get("choices") {
        Some(serde_json::Value::Array(arr)) if !arr.is_empty() => &arr[0],
        _ => {
            // Check for usage in final chunk (no choices)
            if let Some(usage) = parsed.get("usage") {
                chunks.push(SseChunk::Usage {
                    input: usage.get("prompt_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    output: usage.get("completion_tokens").and_then(|v| v.as_u64()).unwrap_or(0),
                    reasoning: usage
                        .get("completion_tokens_details")
                        .and_then(|d| d.get("reasoning_tokens"))
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0),
                });
            }
            return chunks;
        }
    };

    let delta = choices.get("delta");
    let finish_reason = choices
        .get("finish_reason")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    // ── Handle empty delta (only finish_reason or usage) ──
    if delta.is_none() || delta == Some(&serde_json::Value::Null) {
        // End of reasoning or text signaled by finish_reason
        if finish_reason == "stop" {
            if state.reasoning_active {
                chunks.push(SseChunk::ReasoningEnd);
                state.reasoning_active = false;
            }
            if state.text_active {
                chunks.push(SseChunk::TextEnd);
                state.text_active = false;
            }
        }

        // Complete tool calls when finish_reason is "tool_calls"
        if finish_reason == "tool_calls" {
            // End text if active
            if state.text_active {
                chunks.push(SseChunk::TextEnd);
                state.text_active = false;
            }
            // End reasoning if active
            if state.reasoning_active {
                chunks.push(SseChunk::ReasoningEnd);
                state.reasoning_active = false;
            }
            // Flush accumulated tool calls
            for (_idx, buf) in state.tool_call_buffers.drain() {
                chunks.push(SseChunk::ToolCallEnd {
                    id: buf.id,
                    name: buf.name,
                    args: buf.args_buffer,
                });
            }
        }

        return chunks;
    }

    let delta = delta.unwrap();

    // ── Handle reasoning content ──
    if let Some(reasoning) = delta.get("reasoning_content") {
        if let Some(text) = reasoning.as_str() {
            if !text.is_empty() {
                if !state.reasoning_active {
                    chunks.push(SseChunk::ReasoningStart);
                    state.reasoning_active = true;
                }
                chunks.push(SseChunk::ReasoningDelta {
                    delta: text.to_string(),
                });
            }
        }
    }

    // ── Handle text content ──
    if let Some(content) = delta.get("content") {
        if let Some(text) = content.as_str() {
            if !text.is_empty() {
                if !state.text_active {
                    chunks.push(SseChunk::TextStart);
                    state.text_active = true;
                }
                chunks.push(SseChunk::TextDelta {
                    delta: text.to_string(),
                });
            }
        }
    }

    // ── Handle tool calls ──
    if let Some(tool_calls) = delta.get("tool_calls") {
        if let Some(arr) = tool_calls.as_array() {
            for tc in arr {
                let index = tc.get("index").and_then(|v| v.as_i64()).unwrap_or(0);
                let id = tc
                    .get("id")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let function = tc.get("function");

                let entry = state
                    .tool_call_buffers
                    .entry(index)
                    .or_insert_with(|| ToolCallBuffer {
                        id: id.clone(),
                        name: String::new(),
                        args_buffer: String::new(),
                    });

                // Update id if provided
                if !id.is_empty() {
                    entry.id = id;
                }

                if let Some(func) = function {
                    // Update name if provided
                    if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                        if !name.is_empty() {
                            let is_new = entry.name.is_empty();
                            entry.name = name.to_string();
                            if is_new {
                                chunks.push(SseChunk::ToolCallStart {
                                    id: entry.id.clone(),
                                    name: name.to_string(),
                                });
                            }
                        }
                    }
                    // Accumulate arguments
                    if let Some(args) = func.get("arguments").and_then(|v| v.as_str()) {
                        entry.args_buffer.push_str(args);
                    }
                }
            }
        }
    }

    // ── Handle finish_reason with content present ──
    if finish_reason == "stop" {
        if state.reasoning_active {
            chunks.push(SseChunk::ReasoningEnd);
            state.reasoning_active = false;
        }
        if state.text_active {
            chunks.push(SseChunk::TextEnd);
            state.text_active = false;
        }
    }

    if finish_reason == "tool_calls" {
        if state.text_active {
            chunks.push(SseChunk::TextEnd);
            state.text_active = false;
        }
        if state.reasoning_active {
            chunks.push(SseChunk::ReasoningEnd);
            state.reasoning_active = false;
        }
        for (_idx, buf) in state.tool_call_buffers.drain() {
            chunks.push(SseChunk::ToolCallEnd {
                id: buf.id,
                name: buf.name,
                args: buf.args_buffer,
            });
        }
    }

    chunks
}

// ─── Main Streaming Function ─────────────────────

/// Stream chat completion from an LLM provider.
///
/// Sends a POST to the OpenAI-compatible endpoint with `stream: true`,
/// parses the SSE byte stream, and yields `SseChunk` events.
///
/// Returns a `Stream` that can be polled with `futures::StreamExt` methods.
pub async fn stream_chat_completion(
    config: &ProviderConfig,
    messages: &[ChatMessage],
    tools: Option<&[ToolDef]>,
) -> Result<
    Pin<Box<dyn Stream<Item = Result<SseChunk, ProviderError>> + Send>>,
    ProviderError,
> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(300)) // 5 min total timeout
        .build()
        .map_err(|e| ProviderError::Http(e.to_string()))?;

    // Build request using the proper struct for correct serialization
    let request = ChatCompletionRequest {
        model: config.model.clone(),
        messages: messages.to_vec(),
        stream: true,
        tools: tools.map(|t| t.to_vec()),
        temperature: None,
    };

    // Log request for debugging (first 200 chars)
    let req_json = serde_json::to_string(&request).unwrap_or_default();
    eprintln!(
        "[sidecar-agent] POST {} ({} bytes) model={}",
        config.endpoint_url,
        req_json.len(),
        config.model,
    );

    let response = client
        .post(&config.endpoint_url)
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .body(req_json)
        .send()
        .await
        .map_err(|e| ProviderError::Http(e.to_string()))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        let detail = body.chars().take(500).collect::<String>();
        eprintln!(
            "[sidecar-agent] API error {} from {}: {}",
            status, config.endpoint_url, detail
        );
        return Err(ProviderError::ApiError {
            status,
            body: format!("端点: {} — HTTP {}: {}", config.endpoint_url, status, detail),
        });
    }

    let byte_stream = response.bytes_stream();
    let event_stream = eventsource_stream::EventStream::new(byte_stream);

    // Convert EventStream<Bytes> into our SseChunk stream with parser state
    let state = std::sync::Mutex::new(ParserState::new());

    let chunk_stream = async_stream::stream! {
        use futures::StreamExt;
        tokio::pin!(event_stream);

        while let Some(result) = event_stream.next().await {
            match result {
                Ok(event) => {
                    let data_str = event.data;
                    let chunks = {
                        let mut s = state.lock().unwrap();
                        parse_sse_data(&data_str, &mut s)
                    };
                    for chunk in chunks {
                        yield Ok(chunk);
                    }
                }
                Err(e) => {
                    // Stream ended or error — break the loop naturally
                    yield Err(ProviderError::Stream(format!("SSE stream error: {}", e)));
                    break;
                }
            }
        }
    };

    Ok(Box::pin(chunk_stream))
}

// ─── Error Types ──────────────────────────────────

/// Errors that can occur during LLM provider communication.
#[derive(Debug, thiserror::Error)]
pub enum ProviderError {
    #[error("HTTP error: {0}")]
    Http(String),

    #[error("API error {status}: {body}")]
    ApiError { status: u16, body: String },

    #[error("Stream error: {0}")]
    Stream(String),
}

// ─── Tests ───────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ─── ProviderConfig tests ───

    #[test]
    fn config_deepseek_default() {
        let cfg = config_for_model("deepseek-chat", "sk-test");
        assert!(cfg.endpoint_url.contains("api.deepseek.com"));
        assert_eq!(cfg.api_key, "sk-test");
        assert_eq!(cfg.model, "deepseek-chat");
    }

    #[test]
    fn config_openai() {
        let cfg = config_for_model("gpt-4", "sk-openai");
        assert!(cfg.endpoint_url.contains("api.openai.com"));
    }

    #[test]
    fn config_anthropic() {
        let cfg = config_for_model("claude-sonnet-4-20250514", "sk-ant");
        assert!(cfg.endpoint_url.contains("api.anthropic.com"));
    }

    #[test]
    fn config_google() {
        let cfg = config_for_model("gemini-2.5-flash", "sk-google");
        assert!(cfg.endpoint_url.contains("generativelanguage.googleapis.com"));
    }

    #[test]
    fn config_unknown_fallback_to_deepseek() {
        let cfg = config_for_model("unknown-model", "sk-xxx");
        assert!(cfg.endpoint_url.contains("api.deepseek.com"));
    }

    // ─── SSE Parsing: Text Content ────────────────

    #[test]
    fn parse_text_delta() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"content":"Hello"},"finish_reason":null}]}"#,
            &mut state,
        );
        assert_eq!(chunks.len(), 2); // TextStart + TextDelta
        assert!(matches!(chunks[0], SseChunk::TextStart));
        match &chunks[1] {
            SseChunk::TextDelta { delta } => assert_eq!(delta, "Hello"),
            other => panic!("Expected TextDelta, got {:?}", other),
        }
    }

    #[test]
    fn parse_multiple_text_deltas() {
        let mut state = ParserState::new();

        let chunks1 = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"content":"Hello "},"finish_reason":null}]}"#,
            &mut state,
        );
        assert_eq!(chunks1.len(), 2); // TextStart + TextDelta

        let chunks2 = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"content":"World"},"finish_reason":null}]}"#,
            &mut state,
        );
        assert_eq!(chunks2.len(), 1); // Just TextDelta (already started)
        match &chunks2[0] {
            SseChunk::TextDelta { delta } => assert_eq!(delta, "World"),
            other => panic!("Expected TextDelta, got {:?}", other),
        }
    }

    #[test]
    fn parse_text_end_on_stop() {
        let mut state = ParserState::new();
        // First chunk starts text
        parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"content":"Hi"},"finish_reason":null}]}"#,
            &mut state,
        );
        // Final chunk ends text
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#,
            &mut state,
        );
        assert!(chunks.iter().any(|c| matches!(c, SseChunk::TextEnd)));
    }

    // ─── SSE Parsing: Reasoning Content ────────────

    #[test]
    fn parse_reasoning_delta() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"reasoning_content":"Let me think..."},"finish_reason":null}]}"#,
            &mut state,
        );
        assert_eq!(chunks.len(), 2); // ReasoningStart + ReasoningDelta
        assert!(matches!(chunks[0], SseChunk::ReasoningStart));
        match &chunks[1] {
            SseChunk::ReasoningDelta { delta } => assert_eq!(delta, "Let me think..."),
            other => panic!("Expected ReasoningDelta, got {:?}", other),
        }
    }

    #[test]
    fn parse_reasoning_end() {
        let mut state = ParserState::new();
        parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"reasoning_content":"thinking"},"finish_reason":null}]}"#,
            &mut state,
        );
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#,
            &mut state,
        );
        assert!(chunks.iter().any(|c| matches!(c, SseChunk::ReasoningEnd)));
    }

    // ─── SSE Parsing: Tool Calls ───────────────────

    #[test]
    fn parse_tool_call_start() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"bash","arguments":""}}]},"finish_reason":null}]}"#,
            &mut state,
        );
        assert!(chunks.iter().any(|c| matches!(c, SseChunk::ToolCallStart { .. })));
        match &chunks[0] {
            SseChunk::ToolCallStart { id, name } => {
                assert_eq!(id, "call_1");
                assert_eq!(name, "bash");
            }
            other => panic!("Expected ToolCallStart, got {:?}", other),
        }
    }

    #[test]
    fn parse_tool_call_accumulation() {
        let mut state = ParserState::new();

        // First chunk: tool call name
        parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"bash","arguments":"{\"com"}}]},"finish_reason":null}]}"#,
            &mut state,
        );
        // Second chunk: more arguments
        parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"mand\":\"ls -la\"}"}}]},"finish_reason":null}]}"#,
            &mut state,
        );
        // Final chunk: finish_reason=tool_calls → flush
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}"#,
            &mut state,
        );

        let tool_end = chunks.iter().find(|c| matches!(c, SseChunk::ToolCallEnd { .. }));
        assert!(tool_end.is_some());
        match tool_end.unwrap() {
            SseChunk::ToolCallEnd { id, name, args } => {
                assert_eq!(id, "call_abc");
                assert_eq!(name, "bash");
                assert_eq!(args, r#"{"command":"ls -la"}"#);
            }
            other => panic!("Expected ToolCallEnd, got {:?}", other),
        }
    }

    #[test]
    fn parse_multiple_tool_calls() {
        let mut state = ParserState::new();

        // Two tool calls in one chunk
        let chunks = parse_sse_data(
            r#"{"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"bash","arguments":"{}"}},{"index":1,"id":"c2","type":"function","function":{"name":"file_read","arguments":"{\"path\":\"/f\"}"}}]},"finish_reason":"tool_calls"}]}"#,
            &mut state,
        );

        // Both tool calls should have ToolCallEnd
        let tool_ends: Vec<_> = chunks.iter().filter(|c| matches!(c, SseChunk::ToolCallEnd { .. })).collect();
        assert_eq!(tool_ends.len(), 2);
    }

    // ─── SSE Parsing: Usage ────────────────────────

    #[test]
    fn parse_usage_from_final_chunk() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data(
            r#"{"usage":{"prompt_tokens":100,"completion_tokens":50,"completion_tokens_details":{"reasoning_tokens":500}}}"#,
            &mut state,
        );
        assert!(chunks.iter().any(|c| matches!(c, SseChunk::Usage { .. })));
        match chunks.iter().find(|c| matches!(c, SseChunk::Usage { .. })).unwrap() {
            SseChunk::Usage { input, output, reasoning } => {
                assert_eq!(*input, 100);
                assert_eq!(*output, 50);
                assert_eq!(*reasoning, 500);
            }
            _ => panic!("Expected Usage"),
        }
    }

    // ─── SSE Parsing: Errors ───────────────────────

    #[test]
    fn parse_invalid_json_emits_error() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data("not valid json at all", &mut state);
        assert_eq!(chunks.len(), 1);
        assert!(matches!(chunks[0], SseChunk::Error { .. }));
    }

    #[test]
    fn parse_empty_string_no_chunks() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data("", &mut state);
        assert!(chunks.is_empty());
    }

    #[test]
    fn parse_done_sentinel_no_chunks() {
        let mut state = ParserState::new();
        let chunks = parse_sse_data("[DONE]", &mut state);
        assert!(chunks.is_empty());
    }

    // ─── ProviderConfig endpoint URL formatting ────

    #[test]
    fn endpoint_url_includes_chat_completions() {
        for model in &["deepseek-chat", "gpt-4", "claude-sonnet", "gemini-flash"] {
            let cfg = config_for_model(model, "sk-test");
            assert!(
                cfg.endpoint_url.ends_with("/chat/completions"),
                "{} endpoint: {}",
                model,
                cfg.endpoint_url
            );
        }
    }

    // ─── Request Body Contract Tests ────────────────

    #[test]
    fn chat_message_user_role() {
        let msg = ChatMessage {
            role: "user".to_string(),
            content: Some("hello".to_string()),
            tool_call_id: None,
            tool_calls: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""role":"user""#));
        assert!(json.contains(r#""content":"hello""#));
        // tool_call_id 和 tool_calls 不应出现在 user 消息中
        assert!(!json.contains("tool_call_id"));
        assert!(!json.contains("tool_calls"));
    }

    #[test]
    fn chat_message_tool_role_requires_tool_call_id() {
        let msg = ChatMessage {
            role: "tool".to_string(),
            content: Some(r#"{"stdout":"ok"}"#.to_string()),
            tool_call_id: Some("call_abc123".to_string()),
            tool_calls: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""role":"tool""#));
        assert!(json.contains(r#""tool_call_id":"call_abc123""#));
        assert!(json.contains(r#""content""#));
    }

    #[test]
    fn tool_message_without_tool_call_id_panics_in_api() {
        // 这是导致 400 错误的场景：tool 消息缺少 tool_call_id
        // 模拟修复前的情况
        let msg = ChatMessage {
            role: "tool".to_string(),
            content: Some("result".to_string()),
            tool_call_id: None, // ← BUG: 缺少这个会导致 API 400
            tool_calls: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        // 验证 JSON 中确实没有 tool_call_id（这就是 bug 的根因）
        assert!(!json.contains("tool_call_id"), "修复前的 bug：tool 消息无 tool_call_id，API 会返回 400");
    }

    #[test]
    fn assistant_with_tool_calls_uses_arguments_not_parameters() {
        // 关键区别：assistant 消息中的 tool_calls 使用 arguments (JSON 字符串)，
        // 而不是 tools 数组中的 parameters (JSON Schema 对象)
        let tc = ToolCallDef {
            id: "call_1".to_string(),
            call_type: "function".to_string(),
            function: ToolCallFunctionDef {
                name: "bash".to_string(),
                arguments: r#"{"command":"ls"}"#.to_string(),
            },
        };
        let msg = ChatMessage {
            role: "assistant".to_string(),
            content: None,
            tool_call_id: None,
            tool_calls: Some(vec![tc]),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains(r#""role":"assistant""#));
        assert!(json.contains(r#""tool_calls""#));
        assert!(json.contains(r#""id":"call_1""#));
        assert!(json.contains(r#""type":"function""#));
        assert!(json.contains(r#""name":"bash""#));
        // 关键断言：assistant 消息必须用 arguments (JSON 字符串)，不是 parameters
        assert!(json.contains(r#""arguments":"{\"command\":\"ls\"}"#),
            "assistant tool_calls MUST use arguments (JSON string), not parameters");
        // 确保没有出现 parameters（那是 tools 数组用的）
        assert!(!json.contains(r#""parameters""#),
            "assistant tool_calls must NOT have parameters field (that's for tool definitions)");
    }

    #[test]
    fn tool_definition_uses_parameters_not_arguments() {
        // 工具定义（tools 数组）使用 parameters (JSON Schema 对象)
        let td = ToolDef {
            tool_type: "function".to_string(),
            function: FunctionDef {
                name: "bash".to_string(),
                description: "Run a command".to_string(),
                parameters: serde_json::json!({"type": "object", "properties": {"command": {"type": "string"}}}),
            },
        };
        let json = serde_json::to_string(&td).unwrap();
        // tools 数组用 parameters (JSON Schema 对象)
        assert!(json.contains(r#""parameters""#), "tool definitions MUST use parameters");
        assert!(!json.contains(r#""arguments""#), "tool definitions must NOT use arguments");
    }

    #[test]
    fn full_request_with_tools_serializes_correctly() {
        let request = ChatCompletionRequest {
            model: "deepseek-chat".to_string(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: Some("You are helpful.".to_string()),
                    tool_call_id: None,
                    tool_calls: None,
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: Some("Run ls".to_string()),
                    tool_call_id: None,
                    tool_calls: None,
                },
            ],
            stream: true,
            tools: Some(vec![ToolDef {
                tool_type: "function".to_string(),
                function: FunctionDef {
                    name: "bash".to_string(),
                    description: "Run a command".to_string(),
                    parameters: serde_json::json!({"type": "object", "properties": {"command": {"type": "string"}}}),
                },
            }]),
            temperature: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        // 验证顶层结构
        assert_eq!(parsed["model"], "deepseek-chat");
        assert_eq!(parsed["stream"], true);
        assert!(parsed["messages"].is_array());
        assert_eq!(parsed["messages"][0]["role"], "system");
        assert_eq!(parsed["messages"][1]["role"], "user");

        // 验证 tools 格式
        assert!(parsed["tools"].is_array());
        assert_eq!(parsed["tools"][0]["type"], "function");
        assert_eq!(parsed["tools"][0]["function"]["name"], "bash");

        // system/user 消息不应包含 tool_call_id / tool_calls
        assert!(parsed["messages"][0].get("tool_call_id").is_none());
        assert!(parsed["messages"][1].get("tool_call_id").is_none());
        assert!(parsed["messages"][0].get("tool_calls").is_none());
        assert!(parsed["messages"][1].get("tool_calls").is_none());
    }

    #[test]
    fn full_conversation_roundtrip_with_tool_calls() {
        // 模拟完整的 API 对话：user → assistant(tool_calls) → tool(results) → assistant(final)
        let messages = vec![
            ChatMessage {
                role: "user".to_string(),
                content: Some("list files".to_string()),
                tool_call_id: None,
                tool_calls: None,
            },
            ChatMessage {
                role: "assistant".to_string(),
                content: None,
                tool_call_id: None,
                tool_calls: Some(vec![ToolCallDef {
                    id: "call_abc".to_string(),
                    call_type: "function".to_string(),
                    function: ToolCallFunctionDef {
                        name: "bash".to_string(),
                        arguments: r#"{"command":"ls"}"#.to_string(),
                    },
                }]),
            },
            ChatMessage {
                role: "tool".to_string(),
                content: Some(r#"{"stdout":"file1.txt\nfile2.txt","exit_code":0}"#.to_string()),
                tool_call_id: Some("call_abc".to_string()),
                tool_calls: None,
            },
        ];

        let request = ChatCompletionRequest {
            model: "deepseek-chat".to_string(),
            messages,
            stream: true,
            tools: None,
            temperature: None,
        };

        let json = serde_json::to_string(&request).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        let msgs = parsed["messages"].as_array().unwrap();

        // User 消息
        assert_eq!(msgs[0]["role"], "user");

        // Assistant 消息有 tool_calls，必须用 arguments (JSON 字符串)
        assert_eq!(msgs[1]["role"], "assistant");
        let tc = &msgs[1]["tool_calls"][0];
        assert_eq!(tc["id"], "call_abc");
        assert_eq!(tc["function"]["name"], "bash");
        assert!(tc["function"].get("arguments").is_some(), "tool_calls MUST have arguments field");
        assert!(tc["function"].get("parameters").is_none(), "tool_calls must NOT have parameters");

        // Tool 消息必须有 tool_call_id
        assert_eq!(msgs[2]["role"], "tool");
        assert_eq!(msgs[2]["tool_call_id"], "call_abc");
        assert!(msgs[2]["content"].as_str().unwrap().contains("file1.txt"));
    }
}
