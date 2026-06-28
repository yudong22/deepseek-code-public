//! SubAgent tool: delegates a coding task to a nested agent loop.
//!
//! Spawns an internal agent (same provider, same tools) with a focused prompt
//! and a limited step budget. The sub-agent works independently, reads/writes
//! files within the workspace, and returns its final text output to the main agent.
//!
//! This is the same pattern as Claude Code's subagent: the main agent can
//! parallelize complex multi-file tasks by delegating to focused sub-agents.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;
use std::sync::atomic::Ordering;

const SUBAGENT_MAX_STEPS: usize = 10;
const SUBAGENT_MAX_CONTINUATIONS: usize = 3;

pub struct SubAgentTool;

impl Tool for SubAgentTool {
    fn name(&self) -> &'static str {
        "subagent"
    }

    fn description(&self) -> &'static str {
        "Delegate a focused coding task to a sub-agent that runs its own tool loop.\
         The sub-agent has full file read/write access within the workspace.\
         Use for complex multi-step tasks that benefit from isolated execution.\
         Returns the sub-agent's final text output."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task for the sub-agent. Be specific: include file paths, expected changes, and constraints."
                },
                "description": {
                    "type": "string",
                    "description": "Short label describing what this sub-agent does (shown in UI)"
                }
            },
            "required": ["prompt"]
        })
    }

    fn is_read_only(&self) -> bool {
        false // SubAgent can write files via its own tool loop
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let prompt = input
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let description = input
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("(sub-agent)");

        if prompt.is_empty() {
            return ToolResult::error("SubAgent requires a non-empty prompt");
        }

        // Build a minimal system message for the sub-agent
        let system_content = format!(
            "You are a focused sub-agent working on a specific task. \
             Work efficiently and return only the completed work. \
             You have full access to read, write, edit, search, and execute commands within the workspace.\n\
             Task: {}",
            prompt
        );

        // Build messages for the sub-agent
        let messages = vec![
            crate::provider::ChatMessage {
                role: "system".to_string(),
                content: Some(system_content),
                tool_call_id: None,
                tool_calls: None,
            },
            crate::provider::ChatMessage {
                role: "user".to_string(),
                content: Some(prompt.to_string()),
                tool_call_id: None,
                tool_calls: None,
            },
        ];

        // Run a synchronous mini agent loop
        let result = run_subagent_loop(
            messages,
            ctx,
            SUBAGENT_MAX_STEPS,
            SUBAGENT_MAX_CONTINUATIONS,
        );

        match result {
            Ok(text_output) => ToolResult::success(serde_json::json!({
                "status": "ok",
                "description": description,
                "output": text_output,
            })),
            Err(e) => ToolResult::error(format!("Sub-agent error: {}", e)),
        }
    }
}

/// Run a synchronous mini agent loop for the sub-agent.
///
/// This is a simplified version of the main agent loop, running synchronously
/// because the Tool trait's execute() is sync. It does NOT emit events — it
/// only collects the final text output.
fn run_subagent_loop(
    mut messages: Vec<crate::provider::ChatMessage>,
    ctx: &ToolContext,
    max_steps: usize,
    max_continuations: usize,
) -> Result<String, String> {
    let mut text_output = String::new();
    let mut step = 0;
    let mut continuations = 0;

    // Build tool registry (all tools available to sub-agent)
    let registry = crate::tools::default_registry();
    let tool_defs: Vec<crate::provider::ToolDef> = registry.definitions();

    let api_url = ctx.provider_config.endpoint_url.clone();
    let api_key = ctx.provider_config.api_key.clone();
    let model = ctx.provider_config.model.clone();

    while step < max_steps {
        // Check cancellation
        if ctx.cancel_flag.load(Ordering::Relaxed) {
            return Err("Sub-agent cancelled".to_string());
        }

        step += 1;

        // Call LLM
        let request_body = serde_json::json!({
            "model": model,
            "messages": messages,
            "tools": tool_defs,
            "stream": true,
        });

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(&api_url)
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .map_err(|e| format!("Sub-agent LLM request failed: {}", e))?;

        let body = response
            .text()
            .map_err(|e| format!("Sub-agent response read failed: {}", e))?;

        // Parse SSE response for content and tool calls
        let (content, tool_calls) = parse_sse_response(&body)?;

        text_output.push_str(&content);
        text_output.push('\n');

        // If no tool calls, the sub-agent is done
        if tool_calls.is_empty() {
            // Check for auto-continuation (finish_reason="length")
            if body.contains("\"finish_reason\":\"length\"") && continuations < max_continuations {
                continuations += 1;
                messages.push(crate::provider::ChatMessage {
                    role: "assistant".to_string(),
                    content: Some(content),
                    tool_call_id: None,
                    tool_calls: None,
                });
                messages.push(crate::provider::ChatMessage {
                    role: "user".to_string(),
                    content: Some("Please continue.".to_string()),
                    tool_call_id: None,
                    tool_calls: None,
                });
                continue;
            }
            break;
        }

        // Reset continuation counter when we have tool calls
        continuations = 0;

        // Add assistant message with tool calls
        messages.push(crate::provider::ChatMessage {
            role: "assistant".to_string(),
            content: if content.is_empty() { None } else { Some(content.clone()) },
            tool_call_id: None,
            tool_calls: Some(
                tool_calls
                    .iter()
                    .map(|tc| crate::provider::ToolCallDef {
                        id: tc.id.clone(),
                        call_type: "function".to_string(),
                        function: crate::provider::ToolCallFunctionDef {
                            name: tc.name.clone(),
                            arguments: tc.args.clone(),
                        },
                    })
                    .collect(),
            ),
        });

        // Execute each tool call and add results
        for tc in &tool_calls {
            let tool = match registry.find(&tc.name) {
                Some(t) => t,
                None => {
                    messages.push(crate::provider::ChatMessage {
                        role: "tool".to_string(),
                        content: Some(format!("Unknown tool: {}", tc.name)),
                        tool_call_id: Some(tc.id.clone()),
                        tool_calls: None,
                    });
                    continue;
                }
            };

            // Parse args as JSON Value
            let args: Value = serde_json::from_str(&tc.args).unwrap_or(Value::Null);

            let tool_ctx = ToolContext {
                workspace_path: ctx.workspace_path.clone(),
                session_id: format!("{}-sub", ctx.session_id),
                call_id: tc.id.clone(),
                cancel_flag: ctx.cancel_flag.clone(),
                provider_config: ctx.provider_config.clone(),
            };

            let result = tool.execute(args, &tool_ctx);

            let result_content = match result {
                ToolResult::Success { output } => output.to_string(),
                ToolResult::Error { message } => message,
            };

            messages.push(crate::provider::ChatMessage {
                role: "tool".to_string(),
                content: Some(result_content),
                tool_call_id: Some(tc.id.clone()),
                tool_calls: None,
            });
        }
    }

    if text_output.trim().is_empty() {
        Err("Sub-agent produced no output".to_string())
    } else {
        Ok(text_output.trim().to_string())
    }
}

struct ParsedToolCall {
    id: String,
    name: String,
    args: String,
}

/// Parse SSE (Server-Sent Events) response body for text content and tool calls.
fn parse_sse_response(body: &str) -> Result<(String, Vec<ParsedToolCall>), String> {
    let mut content = String::new();
    let mut tool_calls: std::collections::HashMap<usize, ParsedToolCall> = std::collections::HashMap::new();

    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || !line.starts_with("data: ") {
            continue;
        }

        let json_str = &line[6..]; // Strip "data: " prefix
        if json_str == "[DONE]" {
            continue;
        }

        let chunk: Value = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(_) => continue,
        };

        // Extract choices
        let choices = match chunk.get("choices").and_then(|c| c.as_array()) {
            Some(c) => c,
            None => continue,
        };

        for choice in choices {
            // Text content (delta)
            if let Some(delta) = choice.get("delta") {
                if let Some(text) = delta.get("content").and_then(|v| v.as_str()) {
                    content.push_str(text);
                }

                // Tool calls in delta
                if let Some(tc_array) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                    for tc in tc_array {
                        let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                        let entry = tool_calls.entry(idx).or_insert_with(|| ParsedToolCall {
                            id: String::new(),
                            name: String::new(),
                            args: String::new(),
                        });

                        if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                            entry.id = id.to_string();
                        }
                        if let Some(func) = tc.get("function") {
                            if let Some(name) = func.get("name").and_then(|v| v.as_str()) {
                                entry.name = name.to_string();
                            }
                            if let Some(args) = func.get("arguments").and_then(|v| v.as_str()) {
                                entry.args.push_str(args);
                            }
                        }
                    }
                }
            }

            // Finish reason
            if let Some(finish) = choice.get("finish_reason").and_then(|v| v.as_str()) {
                if finish == "length" {
                    // Will be handled by caller for auto-continuation
                }
            }
        }
    }

    let tc_vec: Vec<ParsedToolCall> = tool_calls.into_values().collect();
    Ok((content, tc_vec))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn empty_prompt_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = SubAgentTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(serde_json::json!({"prompt": ""}), &ctx);
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn parse_sse_with_content() {
        let body = r#"data: {"choices":[{"delta":{"content":"Hello"},"index":0}]}

data: {"choices":[{"delta":{"content":" World"},"index":0}]}

data: [DONE]
"#;
        let (content, tool_calls) = parse_sse_response(body).unwrap();
        assert_eq!(content, "Hello World");
        assert!(tool_calls.is_empty());
    }

    #[test]
    fn parse_sse_with_tool_call() {
        let body = r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"bash","arguments":"echo"}}]},"index":0}]}

data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" hi"}}]},"index":0}]}

data: [DONE]
"#;
        let (_content, tool_calls) = parse_sse_response(body).unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].name, "bash");
        assert_eq!(tool_calls[0].args, "echo hi");
    }

    #[test]
    fn parse_sse_empty() {
        let (content, tool_calls) = parse_sse_response("").unwrap();
        assert!(content.is_empty());
        assert!(tool_calls.is_empty());
    }
}
