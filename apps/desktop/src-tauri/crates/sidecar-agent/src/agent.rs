//! Main agent loop: orchestrates LLM calls, tool execution, and event streaming.
//!
//! This is the core engine that replaces `session.prompt()` from the TS sidecar.

use crate::protocol::{AgentEvent, build_tool_success_result};
use crate::provider::{self, ChatMessage, ProviderConfig, SseChunk};
use crate::tools::{Tool, ToolContext, ToolRegistry, ToolResult};
use crate::session::SessionStore;
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::mpsc;

/// Maximum number of agent steps (LLM → tool → LLM cycles).
const MAX_STEPS: usize = 25;

/// Maximum number of consecutive auto-continuations (finish_reason="length" retries).
const MAX_CONTINUATIONS: usize = 5;

/// Agent configuration.
#[derive(Debug, Clone)]
pub struct AgentConfig {
    pub api_key: String,
    pub model: String,
    pub workspace_path: std::path::PathBuf,
    pub session_id: String,
    pub agent_mode: Option<String>,
    pub system_messages: Vec<crate::protocol::StdinMessage>,
}

/// The agent orchestrator.
pub struct Agent {
    config: AgentConfig,
    provider_config: ProviderConfig,
    messages: Vec<ChatMessage>,
    tools: ToolRegistry,
    event_tx: mpsc::UnboundedSender<AgentEvent>,
    answer_rx: mpsc::UnboundedReceiver<String>,
    cancel_flag: Arc<AtomicBool>,
    cancel_notify: tokio::sync::watch::Receiver<bool>,
    tool_name_by_call_id: HashMap<String, String>,
    total_tokens_input: i64,
    total_tokens_output: i64,
    total_tokens_reasoning: i64,
    step_count: usize,
}

impl Agent {
    /// Create a new agent.
    pub fn new(
        config: AgentConfig,
        event_tx: mpsc::UnboundedSender<AgentEvent>,
        answer_rx: mpsc::UnboundedReceiver<String>,
        cancel_flag: Arc<AtomicBool>,
        cancel_notify: tokio::sync::watch::Receiver<bool>,
        tools: ToolRegistry,
    ) -> Self {
        let provider_config = provider::config_for_model(&config.model, &config.api_key);

        // Build initial messages from system messages
        let mut messages = Vec::new();
        for sm in &config.system_messages {
            if let Some(content) = &sm.content {
                messages.push(ChatMessage {
                    role: "system".to_string(),
                    content: Some(content.clone()),
                    tool_call_id: None,
                    tool_calls: None,
                });
            }
        }

        Self {
            config,
            provider_config,
            messages,
            tools,
            event_tx,
            answer_rx,
            cancel_flag,
            cancel_notify,
            tool_name_by_call_id: HashMap::new(),
            total_tokens_input: 0,
            total_tokens_output: 0,
            total_tokens_reasoning: 0,
            step_count: 0,
        }
    }

    /// Run the agent loop.
    pub async fn run(&mut self, user_prompt: &str) -> Result<(), String> {
        // Wrap everything so errors are emitted as AgentEvent::Error before returning
        match self.run_inner(user_prompt).await {
            Ok(()) => Ok(()),
            Err(e) => {
                // Emit the error to the frontend before returning
                let _ = self.emit(AgentEvent::Error {
                    message: e.clone(),
                });
                let _ = self.emit(AgentEvent::Finished);
                Err(e)
            }
        }
    }

    /// Inner run — errors are caught and emitted by the outer run().
    async fn run_inner(&mut self, user_prompt: &str) -> Result<(), String> {
        // Add user message
        self.messages.push(ChatMessage {
            role: "user".to_string(),
            content: Some(user_prompt.to_string()),
            tool_call_id: None,
            tool_calls: None,
        });

        // Write system messages to .opencode/system.md
        self.write_system_md()?;

        // Initialize session storage
        let store = SessionStore::new(
            self.config.workspace_path.join(".opencode"),
            &self.config.session_id,
        );

        store.init_tables().map_err(|e| format!("Session DB 初始化失败: {}", e))?;
        store.create_session().map_err(|e| format!("Session 创建失败: {}", e))?;

        // Main loop
        let mut continuation_count: usize = 0;

        while self.step_count < MAX_STEPS {
            if self.cancel_flag.load(Ordering::SeqCst) {
                self.emit(AgentEvent::Error {
                    message: "Agent cancelled by user".to_string(),
                })?;
                break;
            }

            self.step_count += 1;
            self.emit(AgentEvent::StepStarted)?;

            // Build request
            let tool_defs = self.tools.definitions();
            let tool_slice = if tool_defs.is_empty() { None } else { Some(&tool_defs[..]) };

            // Stream from LLM
            let stream = provider::stream_chat_completion(
                &self.provider_config,
                &self.messages,
                tool_slice,
            )
            .await
            .map_err(|e| format!("Provider error: {}", e))?;

            let mut tool_calls_this_turn: Vec<(String, String, String)> = Vec::new(); // (call_id, name, args)
            let mut assistant_content = String::new();
            let mut finish_reason: Option<String> = None;

            use futures::StreamExt;
            tokio::pin!(stream);

            while let Some(result) = stream.next().await {
                if self.cancel_flag.load(Ordering::SeqCst) {
                    break;
                }

                let chunk = result.map_err(|e| format!("Stream error: {}", e))?;

                match chunk {
                    SseChunk::ReasoningStart => {
                        self.emit(AgentEvent::ThinkingStarted)?;
                    }
                    SseChunk::ReasoningDelta { delta } => {
                        self.emit(AgentEvent::Thinking(delta))?;
                    }
                    SseChunk::ReasoningEnd => {
                        self.emit(AgentEvent::ThinkingEnded)?;
                    }
                    SseChunk::TextStart => {
                        self.emit(AgentEvent::TextStarted)?;
                    }
                    SseChunk::TextDelta { delta } => {
                        // Also accumulate for message history
                        assistant_content.push_str(&delta);
                        self.emit(AgentEvent::Text(delta))?;
                    }
                    SseChunk::TextEnd => {
                        self.emit(AgentEvent::TextEnded)?;
                    }
                    SseChunk::ToolCallStart { id, name } => {
                        self.tool_name_by_call_id.insert(id.clone(), name.clone());
                    }
                    SseChunk::ToolCallEnd { id, name, args } => {
                        tool_calls_this_turn.push((id.clone(), name.clone(), args.clone()));
                        // Emit ToolCall event
                        self.emit(AgentEvent::ToolCall {
                            name: name.clone(),
                            args: args.clone(),
                            call_id: id.clone(),
                        })?;
                    }
                    SseChunk::Usage { input, output, reasoning } => {
                        self.total_tokens_input += input as i64;
                        self.total_tokens_output += output as i64;
                        self.total_tokens_reasoning += reasoning as i64;
                    }
                    SseChunk::FinishReason { reason } => {
                        finish_reason = Some(reason);
                    }
                    SseChunk::Error { message } => {
                        self.emit(AgentEvent::Error {
                            message: message.clone(),
                        })?;
                    }
                }
            }

            // Add assistant response to message history (include tool_calls for API spec)
            if !assistant_content.is_empty() || !tool_calls_this_turn.is_empty() {
                let tc_defs: Option<Vec<provider::ToolCallDef>> = if tool_calls_this_turn.is_empty() {
                    None
                } else {
                    Some(
                        tool_calls_this_turn
                            .iter()
                            .map(|(id, name, args)| provider::ToolCallDef {
                                id: id.clone(),
                                call_type: "function".to_string(),
                                function: provider::ToolCallFunctionDef {
                                    name: name.clone(),
                                    // arguments is a JSON string (e.g., "{\"command\": \"ls\"}")
                                    arguments: args.clone(),
                                },
                            })
                            .collect(),
                    )
                };
                self.messages.push(ChatMessage {
                    role: "assistant".to_string(),
                    content: if assistant_content.is_empty() { None } else { Some(assistant_content) },
                    tool_call_id: None,
                    tool_calls: tc_defs,
                });
            }

            // ── Handle truncated response (finish_reason="length", no tool calls) ──
            if tool_calls_this_turn.is_empty() {
                if let Some(reason) = &finish_reason {
                    if reason == "length" && continuation_count < MAX_CONTINUATIONS {
                        continuation_count += 1;
                        // Notify user in the UI
                        self.emit(AgentEvent::Text(
                            "\n\n— 内容已达长度限制，正在自动续写 —".to_string(),
                        ))?;
                        // Inject continuation message so LLM continues writing
                        self.messages.push(ChatMessage {
                            role: "user".to_string(),
                            content: Some("请继续（不要重复已有的内容）".to_string()),
                            tool_call_id: None,
                            tool_calls: None,
                        });
                        self.emit(AgentEvent::StepEnded)?;
                        self.step_count -= 1; // Don't consume the MAX_STEPS budget
                        continue;
                    }
                }
                // Normal completion — no tools called
                break;
            }

            // ── Partition into read-only (parallel-safe) and mutating (serial) ──
            struct PendingCall {
                call_id: String,
                name: String,
                args: serde_json::Value,
            }

            let mut read_only_calls: Vec<PendingCall> = Vec::new();
            let mut mutating_calls: Vec<PendingCall> = Vec::new();

            for (call_id, name, args_str) in &tool_calls_this_turn {
                let args: serde_json::Value =
                    serde_json::from_str(args_str).unwrap_or_default();
                let entry = PendingCall {
                    call_id: call_id.clone(),
                    name: name.clone(),
                    args,
                };
                match name.as_str() {
                    "file_read" | "grep" | "glob" => read_only_calls.push(entry),
                    _ => mutating_calls.push(entry),
                }
            }

            // ── Read-only tools: execute in parallel ──
            if !read_only_calls.is_empty() {
                // Emit ToolStarted for all read-only tools at once (signal parallelism)
                for call in &read_only_calls {
                    self.emit(AgentEvent::ToolStarted {
                        call_id: call.call_id.clone(),
                    })?;
                }

                // Pre-collect tool references so closures don't borrow self
                let mut tool_refs: Vec<Option<Arc<dyn Tool>>> =
                    Vec::with_capacity(read_only_calls.len());
                for call in &read_only_calls {
                    tool_refs.push(self.tools.find(&call.name));
                }

                let workspace = self.config.workspace_path.clone();
                let session = self.config.session_id.clone();

                let parallel_futures: Vec<_> = read_only_calls
                    .into_iter()
                    .zip(tool_refs)
                    .map(|(call, tool_opt)| {
                        let workspace = workspace.clone();
                        let session = session.clone();
                        tokio::task::spawn_blocking(move || {
                            let result = match tool_opt {
                                Some(tool) => {
                                    let ctx = ToolContext {
                                        workspace_path: workspace,
                                        session_id: session,
                                        call_id: call.call_id.clone(),
                                    };
                                    tool.execute(call.args, &ctx)
                                }
                                None => {
                                    ToolResult::error(format!("Unknown tool: {}", call.name))
                                }
                            };
                            (call.call_id, call.name, result)
                        })
                    })
                    .collect();

                let parallel_results = futures::future::join_all(parallel_futures).await;

                for result in parallel_results {
                    match result {
                        Ok((call_id, name, tool_result)) => {
                            match tool_result {
                                ToolResult::Success { output } => {
                                    let enriched = build_tool_success_result(&output);
                                    let result_str = serde_json::to_string(&enriched)
                                        .unwrap_or_default();
                                    self.emit(AgentEvent::ToolSuccess {
                                        name: name.clone(),
                                        result: result_str.clone(),
                                        call_id: call_id.clone(),
                                    })?;
                                    self.messages.push(ChatMessage {
                                        role: "tool".to_string(),
                                        content: Some(result_str),
                                        tool_call_id: Some(call_id.clone()),
                                        tool_calls: None,
                                    });
                                }
                                ToolResult::Error { message } => {
                                    self.emit(AgentEvent::ToolFailed {
                                        name: name.clone(),
                                        error: message.clone(),
                                        call_id: call_id.clone(),
                                    })?;
                                    self.messages.push(ChatMessage {
                                        role: "tool".to_string(),
                                        content: Some(format!("Error: {}", message)),
                                        tool_call_id: Some(call_id.clone()),
                                        tool_calls: None,
                                    });
                                }
                            }
                            self.emit(AgentEvent::ToolEnded { call_id })?;
                        }
                        Err(e) => {
                            self.emit(AgentEvent::ToolFailed {
                                name: "tool".to_string(),
                                error: format!("Tool execution panicked: {}", e),
                                call_id: "?".to_string(),
                            })?;
                        }
                    }
                }
            }

            // ── Mutating tools: execute serially ──
            for call in &mutating_calls {
                if self.cancel_flag.load(Ordering::SeqCst) {
                    break;
                }

                self.emit(AgentEvent::ToolStarted {
                    call_id: call.call_id.clone(),
                })?;

                // Special handling for question tool: wait for user answer or cancellation
                if call.name == "question" {
                    let answer = tokio::select! {
                        a = self.answer_rx.recv() => a,
                        _ = self.cancel_notify.changed() => {
                            None
                        }
                    };

                    match answer {
                        Some(answer) => {
                            let result = serde_json::json!({
                                "answer": answer,
                                "status": "answered"
                            });
                            self.emit(AgentEvent::ToolSuccess {
                                name: call.name.clone(),
                                result: serde_json::to_string(&result).unwrap_or_default(),
                                call_id: call.call_id.clone(),
                            })?;
                            self.messages.push(ChatMessage {
                                role: "tool".to_string(),
                                content: Some(format!("User answered: {}", answer)),
                                tool_call_id: Some(call.call_id.clone()),
                                tool_calls: None,
                            });
                        }
                        None => {
                            let err_msg = if self.cancel_flag.load(Ordering::SeqCst) {
                                "User cancelled".to_string()
                            } else {
                                "No answer received (channel closed)".to_string()
                            };
                            self.emit(AgentEvent::ToolFailed {
                                name: call.name.clone(),
                                error: err_msg.clone(),
                                call_id: call.call_id.clone(),
                            })?;
                            self.messages.push(ChatMessage {
                                role: "tool".to_string(),
                                content: Some(err_msg),
                                tool_call_id: Some(call.call_id.clone()),
                                tool_calls: None,
                            });
                        }
                    }
                } else {
                    // Execute the tool
                    let ctx = ToolContext {
                        workspace_path: self.config.workspace_path.clone(),
                        session_id: self.config.session_id.clone(),
                        call_id: call.call_id.clone(),
                    };

                    match self.tools.find(&call.name) {
                        Some(tool) => match tool.execute(call.args.clone(), &ctx) {
                            ToolResult::Success { output } => {
                                let enriched = build_tool_success_result(&output);
                                let result_str = serde_json::to_string(&enriched)
                                    .unwrap_or_default();
                                self.emit(AgentEvent::ToolSuccess {
                                    name: call.name.clone(),
                                    result: result_str.clone(),
                                    call_id: call.call_id.clone(),
                                })?;
                                self.messages.push(ChatMessage {
                                    role: "tool".to_string(),
                                    content: Some(result_str),
                                    tool_call_id: Some(call.call_id.clone()),
                                    tool_calls: None,
                                });
                            }
                            ToolResult::Error { message } => {
                                self.emit(AgentEvent::ToolFailed {
                                    name: call.name.clone(),
                                    error: message.clone(),
                                    call_id: call.call_id.clone(),
                                })?;
                                self.messages.push(ChatMessage {
                                    role: "tool".to_string(),
                                    content: Some(format!("Error: {}", message)),
                                    tool_call_id: Some(call.call_id.clone()),
                                    tool_calls: None,
                                });
                            }
                        },
                        None => {
                            self.emit(AgentEvent::ToolFailed {
                                name: call.name.clone(),
                                error: format!("Unknown tool: {}", call.name),
                                call_id: call.call_id.clone(),
                            })?;
                        }
                    }
                }

                self.emit(AgentEvent::ToolEnded {
                    call_id: call.call_id.clone(),
                })?;
            }

            self.emit(AgentEvent::StepEnded)?;
        }

        // Save token usage
        store
            .update_usage(
                self.total_tokens_input,
                self.total_tokens_output,
                self.total_tokens_reasoning,
            )
            .ok();

        // Clean up plan mode
        if self.config.agent_mode.as_deref() == Some("plan") {
            store.cleanup_plan_mode().ok();
        }

        // Emit final events
        self.emit(AgentEvent::Usage {
            tokens_input: self.total_tokens_input,
            tokens_output: self.total_tokens_output,
            tokens_reasoning: if self.total_tokens_reasoning > 0 {
                Some(self.total_tokens_reasoning)
            } else {
                None
            },
        })?;
        self.emit(AgentEvent::Finished)?;

        Ok(())
    }

    /// Write system messages to .opencode/system.md
    fn write_system_md(&self) -> Result<(), String> {
        let system_content: Vec<String> = self
            .config
            .system_messages
            .iter()
            .filter_map(|m| m.content.as_deref())
            .map(|c| c.to_string())
            .collect();

        if !system_content.is_empty() {
            let opencode_dir = self.config.workspace_path.join(".opencode");
            std::fs::create_dir_all(&opencode_dir)
                .map_err(|e| format!("mkdir .opencode: {}", e))?;
            std::fs::write(opencode_dir.join("system.md"), system_content.join("\n"))
                .map_err(|e| format!("write system.md: {}", e))?;
        }

        Ok(())
    }

    /// Emit an event to the channel.
    fn emit(&self, event: AgentEvent) -> Result<(), String> {
        self.event_tx
            .send(event)
            .map_err(|e| format!("Event channel closed: {}", e))
    }
}
