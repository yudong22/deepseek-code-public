//! SubAgent tool: delegates tasks to typed sub-agents with independent tool loops.
//!
//! Design follows Claude Code's Agent tool pattern (see docs/subagent.md):
//! - Built-in agents: general-purpose, explore, code-reviewer
//! - Custom agents: loaded from `.deepseek-code/agents/*.md` (frontmatter + markdown body)
//! - Tool permission filtering: `tools` / `disallowedTools` per agent definition
//! - Each sub-agent has its own system prompt, tool pool, and step budget
//!
//! Execution is synchronous (blocking) — the main agent waits for the sub-agent
//! to complete and receives the final text output.

use super::{Tool, ToolContext, ToolResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use std::sync::mpsc;

// ─── Agent Definition ──────────────────────────────────────────────

/// Permission mode for sub-agent tool execution.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PermissionMode {
    /// Default — accept file edits without prompting
    AcceptEdits,
    /// Bubble permission requests up to the parent
    Bubble,
    /// Skip all permission checks
    BypassPermissions,
    /// Require plan approval before executing
    Plan,
}

/// Definition of a sub-agent type.
///
/// Mirrors Claude Code's AgentDefinition. Built-in agents are defined in code;
/// custom agents are loaded from `.deepseek-code/agents/*.md` files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDefinition {
    /// Unique identifier — the model references this via `subagent_type`
    pub agent_type: String,
    /// Human-readable description shown to the model
    pub description: String,
    /// When the model should consider using this agent
    #[serde(default)]
    pub when_to_use: String,
    /// Allowed tools: `["*"]` means all, otherwise a list of tool names
    #[serde(default = "default_all_tools")]
    pub tools: Vec<String>,
    /// Explicitly disallowed tools (takes precedence over `tools`)
    #[serde(default)]
    pub disallowed_tools: Vec<String>,
    /// Permission mode (default: acceptEdits)
    #[serde(default = "default_permission_mode")]
    pub permission_mode: PermissionMode,
    /// Maximum turns for the sub-agent loop
    #[serde(default = "default_max_turns")]
    pub max_turns: usize,
    /// Model override: "inherit" (use parent model) or a specific model ID
    #[serde(default = "default_model")]
    pub model: String,
    /// System prompt for the sub-agent
    #[serde(default)]
    pub system_prompt: String,
    /// Source: "built-in" or "custom"
    #[serde(default)]
    pub source: String,
}

fn default_all_tools() -> Vec<String> {
    vec!["*".to_string()]
}
fn default_permission_mode() -> PermissionMode {
    PermissionMode::AcceptEdits
}
fn default_max_turns() -> usize {
    10
}
fn default_model() -> String {
    "inherit".to_string()
}

impl AgentDefinition {
    /// Build system prompt with task context injected.
    fn build_system_prompt(&self, task_prompt: &str) -> String {
        if self.system_prompt.is_empty() {
            format!(
                "You are a focused sub-agent ({}) working on a specific task.\n\
                 Task: {}\n\n\
                 Work efficiently. You have access to tools within the workspace.\n\
                 Return only the completed work — no conversational fluff.",
                self.agent_type, task_prompt
            )
        } else {
            format!(
                "{}\n\n\
                 ## Current Task\n\
                 {}\n\n\
                 Complete this task efficiently and return your results.",
                self.system_prompt, task_prompt
            )
        }
    }
}

// ─── Built-in Agent Definitions ────────────────────────────────────

fn builtin_general_purpose() -> AgentDefinition {
    AgentDefinition {
        agent_type: "general-purpose".to_string(),
        description: "General-purpose agent for researching complex questions, \
                      searching for code, and executing multi-step tasks.".to_string(),
        when_to_use: "Use this agent for tasks that don't fit a more specific agent type. \
                      Good for general coding tasks, bug fixes, and feature implementation.".to_string(),
        tools: vec!["*".to_string()],
        disallowed_tools: vec![],
        permission_mode: PermissionMode::AcceptEdits,
        max_turns: 15,
        model: "inherit".to_string(),
        system_prompt: String::new(), // dynamic — built at execution time
        source: "built-in".to_string(),
    }
}

fn builtin_explore() -> AgentDefinition {
    AgentDefinition {
        agent_type: "explore".to_string(),
        description: "Read-only search agent for broad fan-out searches. \
                      Searches files, directories, and naming conventions.".to_string(),
        when_to_use: "Use this agent when you need to search across many files, \
                      find patterns, or understand code structure without making changes.".to_string(),
        tools: vec![
            "file_read".to_string(),
            "grep".to_string(),
            "glob".to_string(),
            "webfetch".to_string(),
        ],
        disallowed_tools: vec![],
        permission_mode: PermissionMode::AcceptEdits,
        max_turns: 10,
        model: "inherit".to_string(),
        system_prompt: String::new(),
        source: "built-in".to_string(),
    }
}

fn builtin_code_reviewer() -> AgentDefinition {
    AgentDefinition {
        agent_type: "code-reviewer".to_string(),
        description: "Review code for correctness bugs, security issues, \
                      and code quality problems.".to_string(),
        when_to_use: "Use this agent to review code changes for bugs, \
                      security vulnerabilities, and anti-patterns before merging.".to_string(),
        tools: vec![
            "file_read".to_string(),
            "grep".to_string(),
            "glob".to_string(),
        ],
        disallowed_tools: vec![
            "bash".to_string(),
            "file_write".to_string(),
            "file_edit".to_string(),
        ],
        permission_mode: PermissionMode::AcceptEdits,
        max_turns: 10,
        model: "inherit".to_string(),
        system_prompt: String::new(),
        source: "built-in".to_string(),
    }
}

/// Registry of all available agent definitions.
fn builtin_definitions() -> Vec<AgentDefinition> {
    vec![
        builtin_general_purpose(),
        builtin_explore(),
        builtin_code_reviewer(),
    ]
}

// ─── Custom Agent Loading ──────────────────────────────────────────

/// Load custom agent definitions from `.deepseek-code/agents/*.md` files.
///
/// File format:
/// ```markdown
/// ---
/// name: my-agent
/// description: Does something useful
/// tools: "[BashTool, FileReadTool, GrepTool]"
/// maxTurns: 30
/// ---
///
/// System prompt content here...
/// ```
fn load_custom_agents(workspace_path: &std::path::Path) -> Vec<AgentDefinition> {
    let agents_dir = workspace_path.join(".deepseek-code").join("agents");
    if !agents_dir.is_dir() {
        return vec![];
    }

    let mut agents = Vec::new();
    let entries = match std::fs::read_dir(&agents_dir) {
        Ok(e) => e,
        Err(_) => return vec![],
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(true, |e| e != "md") {
            continue;
        }

        let content = match std::fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        if let Some(agent) = parse_custom_agent_md(&content) {
            agents.push(agent);
        }
    }

    agents
}

/// Parse a custom agent Markdown file with YAML frontmatter.
fn parse_custom_agent_md(content: &str) -> Option<AgentDefinition> {
    // Split frontmatter from body
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return None;
    }

    let rest = &trimmed[3..]; // skip opening ---
    let end_idx = rest.find("---")?;
    let frontmatter = &rest[..end_idx];
    let body = rest[end_idx + 3..].trim();

    // Parse frontmatter as simple key: value pairs (lightweight, no YAML lib needed)
    let name = extract_key(frontmatter, "name");
    let description = extract_key(frontmatter, "description").unwrap_or_default();
    let tools_str = extract_key(frontmatter, "tools").unwrap_or_default();
    let disallowed_str = extract_key(frontmatter, "disallowedTools").unwrap_or_default();
    let model = extract_key(frontmatter, "model").unwrap_or_else(|| "inherit".to_string());
    let max_turns: usize = extract_key(frontmatter, "maxTurns")
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    if name.is_none() || body.is_empty() {
        return None;
    }

    let agent_type = name.unwrap();
    let tools = parse_tool_list(&tools_str);
    let disallowed_tools = parse_tool_list(&disallowed_str);

    Some(AgentDefinition {
        agent_type,
        description,
        when_to_use: String::new(),
        tools,
        disallowed_tools,
        permission_mode: PermissionMode::AcceptEdits,
        max_turns,
        model,
        system_prompt: body.to_string(),
        source: "custom".to_string(),
    })
}

/// Extract a key value from YAML-like frontmatter (simple parser, no serde_yaml dep).
fn extract_key(frontmatter: &str, key: &str) -> Option<String> {
    for line in frontmatter.lines() {
        let line = line.trim();
        if let Some(colon_idx) = line.find(':') {
            let k = line[..colon_idx].trim();
            if k == key {
                let v = line[colon_idx + 1..].trim();
                // Strip surrounding quotes
                let v = v.strip_prefix('"').unwrap_or(v);
                let v = v.strip_suffix('"').unwrap_or(v);
                let v = v.strip_prefix('\'').unwrap_or(v);
                let v = v.strip_suffix('\'').unwrap_or(v);
                if v.is_empty() {
                    return None;
                }
                return Some(v.to_string());
            }
        }
    }
    None
}

/// Parse a tool list string like `"[BashTool, FileReadTool, GrepTool]"`.
fn parse_tool_list(s: &str) -> Vec<String> {
    let s = s.trim();
    let s = s.strip_prefix('[').unwrap_or(s);
    let s = s.strip_suffix(']').unwrap_or(s);
    if s.is_empty() {
        return vec![];
    }
    s.split(',')
        .map(|t| {
            let t = t.trim();
            let t = t.strip_prefix('"').unwrap_or(t);
            let t = t.strip_suffix('"').unwrap_or(t);
            t.to_string()
        })
        .filter(|t| !t.is_empty())
        .collect()
}

// ─── Agent Registry ────────────────────────────────────────────────

/// Build the full agent registry: built-in + custom agents.
fn build_registry(workspace_path: &std::path::Path) -> Vec<AgentDefinition> {
    let mut registry = builtin_definitions();
    let customs = load_custom_agents(workspace_path);
    registry.extend(customs);
    registry
}

/// Find an agent definition by type, falling back to general-purpose.
fn resolve_agent(agent_type: &str, workspace_path: &std::path::Path) -> AgentDefinition {
    let registry = build_registry(workspace_path);

    // Exact match
    if let Some(def) = registry.iter().find(|d| d.agent_type == agent_type) {
        return def.clone();
    }

    // Fallback: general-purpose
    registry
        .iter()
        .find(|d| d.agent_type == "general-purpose")
        .cloned()
        .unwrap_or_else(builtin_general_purpose)
}

// ─── Tool Filtering ────────────────────────────────────────────────

/// Filter tool registry based on agent definition's tool permissions.
///
/// Three-layer model (see docs/subagent.md §5.4):
/// 1. Agent definition: `tools` / `disallowedTools`
/// 2. Engine-level: hardcoded deny list (none for now)
/// 3. Runtime: `filterDeniedAgents()`
fn filter_tools_for_agent(
    registry: &crate::tools::ToolRegistry,
    definition: &AgentDefinition,
) -> crate::tools::ToolRegistry {
    // If wildcard "*" is in tools, return full registry minus disallowed
    let has_wildcard = definition.tools.iter().any(|t| t == "*");

    let mut filtered = crate::tools::ToolRegistry::new();
    let all_defs = registry.definitions();
    let all_tool_names: Vec<String> = all_defs.iter().map(|d| d.function.name.clone()).collect();

    // Layer 1: engine-level deny list
    // (no permanently disallowed tools for now)

    // Layer 2: agent definition tools/disallowedTools
    for tool_name in &all_tool_names {
        let allowed = has_wildcard || definition.tools.contains(tool_name);
        let disallowed = definition.disallowed_tools.contains(tool_name);
        if allowed && !disallowed {
            if let Some(tool) = registry.find(tool_name) {
                // ToolRegistry::register takes Box<dyn Tool>, but we have Arc<dyn Tool>
                // Workaround: clone the Arc then leak the Box... no, that's wrong.
                // Actually, ToolRegistry only supports register(Box<dyn Tool>).
                // We need to either add a method or restructure.
                // For now, rebuild from default and filter at registration.
                filtered.register_from_arc(tool);
            }
        }
    }

    filtered
}

// ─── SubAgent Tool ─────────────────────────────────────────────────

pub struct SubAgentTool;

impl Tool for SubAgentTool {
    fn name(&self) -> &'static str {
        "subagent"
    }

    fn description(&self) -> &'static str {
        "Delegate a task to a specialized sub-agent that runs its own independent tool loop.\n\
         Use for complex multi-step tasks that benefit from focused, isolated execution.\n\
         The sub-agent gets its own conversation context and returns final text output.\n\
         \n\
         ## Agent types and when to use each\n\
         - general-purpose: Full tool access (read,write,bash,web). For coding, bug fixes, features.\n\
         - explore: Read-only (file_read,grep,glob,webfetch). For code search & exploration — no changes.\n\
         - code-reviewer: Read-only, no bash. For reviewing correctness, security, code quality.\n\
         \n\
         ## Tool permissions\n\
         | Type | Read | Write/Edit | Bash | Web |\n\
         |------|------|------------|------|-----|\n\
         | general-purpose | yes | yes | yes | yes |\n\
         | explore | yes | no | no | yes |\n\
         | code-reviewer | yes | no | no | no |"
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "subagent_type": {
                    "type": "string",
                    "description": "The type of sub-agent to use: 'general-purpose', 'explore', 'code-reviewer', or a custom agent name from .deepseek-code/agents/",
                    "enum": ["general-purpose", "explore", "code-reviewer"]
                },
                "prompt": {
                    "type": "string",
                    "description": "The task for the sub-agent. Be specific about file paths, expected outputs, and constraints."
                },
                "description": {
                    "type": "string",
                    "description": "Short label shown in the UI for this sub-agent task"
                }
            },
            "required": ["subagent_type", "prompt"]
        })
    }

    fn is_read_only(&self) -> bool {
        false
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let agent_type = input
            .get("subagent_type")
            .and_then(|v| v.as_str())
            .unwrap_or("general-purpose");
        let prompt = input
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let description = input
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or(agent_type);

        if prompt.is_empty() {
            return ToolResult::error("SubAgent requires a non-empty prompt");
        }

        // Resolve agent definition
        let definition = resolve_agent(agent_type, &ctx.workspace_path);

        // Build system prompt
        let system_prompt = definition.build_system_prompt(prompt);

        // Build initial messages
        let messages = vec![
            crate::provider::ChatMessage {
                role: "system".to_string(),
                content: Some(system_prompt),
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

        // Determine model
        let model = if definition.model == "inherit" {
            ctx.provider_config.model.clone()
        } else {
            definition.model.clone()
        };

        // Run sub-agent loop on a dedicated OS thread.
        // The tool execute() runs on a tokio worker — we can't block_on or
        // use reqwest::blocking on that thread. Spawn a real OS thread instead.
        let workspace = ctx.workspace_path.clone();
        let session_id = ctx.session_id.clone();
        let provider = ctx.provider_config.clone();
        let cancel = ctx.cancel_flag.clone();
        let def_clone = definition.clone();
        let call_id = ctx.call_id.clone();
        let event_tx = ctx.event_tx.clone();

        let (tx, rx) = mpsc::channel();

        std::thread::spawn(move || {
            let result = run_subagent_loop(
                messages,
                &workspace,
                &session_id,
                &provider,
                &cancel,
                &def_clone,
                model,
                &tx,
            );
            let _ = tx.send(SubAgentMsg::Done(result));
        });

        // Poll for progress, emit ToolProgress events
        let result = loop {
            match rx.recv() {
                Ok(SubAgentMsg::Progress { step, text }) => {
                    if let Some(ref tx) = event_tx {
                        let _ = tx.send(crate::protocol::AgentEvent::ToolProgress {
                            call_id: call_id.clone(),
                            output: format!("[step {}] {}", step, text),
                        });
                    }
                }
                Ok(SubAgentMsg::Done(r)) => break r,
                Err(_) => break Err("Sub-agent thread panicked".to_string()),
            }
        };
        match result {
            Ok(text_output) => ToolResult::success(serde_json::json!({
                "status": "ok",
                "agent_type": agent_type,
                "description": description,
                "output": text_output,
            })),
            Err(e) => ToolResult::error(format!("Sub-agent '{}' error: {}", agent_type, e)),
        }
    }
}

// ─── Sub-Agent Loop ────────────────────────────────────────────────

const DEFAULT_MAX_CONTINUATIONS: usize = 3;

/// Messages sent from the sub-agent OS thread to the parent.
enum SubAgentMsg {
    /// Progress update: step number + brief description
    Progress { step: usize, text: String },
    /// Final result
    Done(Result<String, String>),
}

fn run_subagent_loop(
    mut messages: Vec<crate::provider::ChatMessage>,
    workspace_path: &std::path::Path,
    session_id: &str,
    provider_config: &crate::provider::ProviderConfig,
    cancel_flag: &std::sync::Arc<std::sync::atomic::AtomicBool>,
    definition: &AgentDefinition,
    model: String,
    progress_tx: &mpsc::Sender<SubAgentMsg>,
) -> Result<String, String> {
    let mut text_output = String::new();
    let mut step = 0;
    let mut continuations = 0;
    let max_steps = definition.max_turns;

    // Build tool registry filtered for this agent
    let full_registry = crate::tools::default_registry();
    let registry = filter_tools_for_agent(&full_registry, definition);
    let tool_defs: Vec<crate::provider::ToolDef> = registry.definitions();

    let api_url = provider_config.endpoint_url.clone();
    let api_key = provider_config.api_key.clone();

    while step < max_steps {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err("cancelled".to_string());
        }

        step += 1;

        // Call LLM (reqwest::blocking — safe because we're on a dedicated OS thread)
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
            .map_err(|e| format!("LLM request failed: {}", e))?;

        let body = response
            .text()
            .map_err(|e| format!("response read failed: {}", e))?;

        let (content, tool_calls) = parse_sse_response(&body)?;

        // Emit progress
        let preview: String = content.chars().take(80).collect();
        let tool_names: Vec<&str> = tool_calls.iter().map(|t| t.name.as_str()).collect();
        let _ = progress_tx.send(SubAgentMsg::Progress {
            step,
            text: if tool_names.is_empty() {
                format!("{} → \"{}\"", definition.agent_type, preview)
            } else {
                format!("{} → calling: {}", definition.agent_type, tool_names.join(", "))
            },
        });

        text_output.push_str(&content);

        if tool_calls.is_empty() {
            if body.contains("\"finish_reason\":\"length\"")
                && continuations < DEFAULT_MAX_CONTINUATIONS
            {
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

        // Execute each tool call
        for tc in &tool_calls {
            let tool = match registry.find(&tc.name) {
                Some(t) => t,
                None => {
                    messages.push(crate::provider::ChatMessage {
                        role: "tool".to_string(),
                        content: Some(format!("Tool not available: {}", tc.name)),
                        tool_call_id: Some(tc.id.clone()),
                        tool_calls: None,
                    });
                    continue;
                }
            };

            let args: Value = serde_json::from_str(&tc.args).unwrap_or(Value::Null);

            let tool_ctx = ToolContext {
                workspace_path: workspace_path.to_path_buf(),
                session_id: format!("{}-sub", session_id),
                call_id: tc.id.clone(),
                cancel_flag: cancel_flag.clone(),
                provider_config: provider_config.clone(),
                event_tx: None,
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
        Err("produced no output".to_string())
    } else {
        Ok(text_output.trim().to_string())
    }
}

// ─── SSE Parser ────────────────────────────────────────────────────

struct ParsedToolCall {
    id: String,
    name: String,
    args: String,
}

fn parse_sse_response(body: &str) -> Result<(String, Vec<ParsedToolCall>), String> {
    let mut content = String::new();
    let mut tool_calls: HashMap<usize, ParsedToolCall> = HashMap::new();

    for line in body.lines() {
        let line = line.trim();
        if line.is_empty() || !line.starts_with("data: ") {
            continue;
        }

        let json_str = &line[6..];
        if json_str == "[DONE]" {
            continue;
        }

        let chunk: Value = match serde_json::from_str(json_str) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let choices = match chunk.get("choices").and_then(|c| c.as_array()) {
            Some(c) => c,
            None => continue,
        };

        for choice in choices {
            if let Some(delta) = choice.get("delta") {
                if let Some(text) = delta.get("content").and_then(|v| v.as_str()) {
                    content.push_str(text);
                }

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
        }
    }

    let tc_vec: Vec<ParsedToolCall> = tool_calls.into_values().collect();
    Ok((content, tc_vec))
}

// ─── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    fn test_ctx(tmp: &tempfile::TempDir) -> ToolContext {
        ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
        }
    }

    // ── Tool tests ──

    #[test]
    fn empty_prompt_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = SubAgentTool;
        let result = tool.execute(
            serde_json::json!({"subagent_type": "general-purpose", "prompt": ""}),
            &test_ctx(&tmp),
        );
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    // ── Agent definition tests ──

    #[test]
    fn builtin_definitions_loaded() {
        let defs = builtin_definitions();
        assert!(defs.len() >= 3);
        assert!(defs.iter().any(|d| d.agent_type == "general-purpose"));
        assert!(defs.iter().any(|d| d.agent_type == "explore"));
        assert!(defs.iter().any(|d| d.agent_type == "code-reviewer"));
    }

    #[test]
    fn explore_is_read_only() {
        let explore = builtin_explore();
        assert!(!explore.tools.contains(&"bash".to_string()));
        assert!(!explore.tools.contains(&"file_write".to_string()));
        assert!(explore.tools.contains(&"file_read".to_string()));
        assert!(explore.tools.contains(&"grep".to_string()));
    }

    #[test]
    fn code_reviewer_disallows_writes() {
        let reviewer = builtin_code_reviewer();
        assert!(reviewer.disallowed_tools.contains(&"bash".to_string()));
        assert!(reviewer.disallowed_tools.contains(&"file_write".to_string()));
        assert!(reviewer.disallowed_tools.contains(&"file_edit".to_string()));
    }

    #[test]
    fn resolve_unknown_falls_back_to_general_purpose() {
        let tmp = tempfile::tempdir().unwrap();
        let agent = resolve_agent("nonexistent-type-xyz", tmp.path());
        assert_eq!(agent.agent_type, "general-purpose");
    }

    #[test]
    fn resolve_explore() {
        let tmp = tempfile::tempdir().unwrap();
        let agent = resolve_agent("explore", tmp.path());
        assert_eq!(agent.agent_type, "explore");
    }

    // ── Custom agent parsing tests ──

    #[test]
    fn parse_custom_agent_valid() {
        let md = r#"---
name: my-reviewer
description: Custom code reviewer
tools: "[FileReadTool, GrepTool, GlobTool]"
maxTurns: 20
---

You are a thorough code reviewer. Focus on security bugs.
"#;
        let agent = parse_custom_agent_md(md).unwrap();
        assert_eq!(agent.agent_type, "my-reviewer");
        assert_eq!(agent.description, "Custom code reviewer");
        assert_eq!(agent.max_turns, 20);
        assert!(agent.system_prompt.contains("thorough code reviewer"));
        assert!(agent.tools.contains(&"FileReadTool".to_string()));
        assert_eq!(agent.source, "custom");
    }

    #[test]
    fn parse_custom_agent_missing_name() {
        let md = r#"---
description: No name here
tools: "[BashTool]"
---

System prompt.
"#;
        assert!(parse_custom_agent_md(md).is_none());
    }

    #[test]
    fn parse_custom_agent_empty_body() {
        let md = r#"---
name: empty-agent
description: Has name but no body
---
"#;
        assert!(parse_custom_agent_md(md).is_none());
    }

    #[test]
    fn parse_custom_agent_no_frontmatter() {
        assert!(parse_custom_agent_md("Just some markdown, no frontmatter").is_none());
    }

    // ── Tool list parsing tests ──

    #[test]
    fn parse_tool_list_basic() {
        let tools = parse_tool_list("[BashTool, FileReadTool, GrepTool]");
        assert_eq!(tools.len(), 3);
        assert!(tools.contains(&"BashTool".to_string()));
    }

    #[test]
    fn parse_tool_list_empty() {
        let tools = parse_tool_list("[]");
        assert!(tools.is_empty());
    }

    #[test]
    fn parse_tool_list_quoted() {
        let tools = parse_tool_list(r#"["BashTool", "FileReadTool"]"#);
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0], "BashTool");
    }

    // ── System prompt tests ──

    #[test]
    fn build_system_prompt_with_task() {
        let def = builtin_general_purpose();
        let prompt = def.build_system_prompt("fix the type errors in src/main.rs");
        assert!(prompt.contains("general-purpose"));
        assert!(prompt.contains("fix the type errors"));
        assert!(prompt.contains("src/main.rs"));
    }

    #[test]
    fn build_system_prompt_with_custom_content() {
        let mut def = builtin_general_purpose();
        def.system_prompt = "You are an expert Rust developer.".to_string();
        let prompt = def.build_system_prompt("refactor the module");
        assert!(prompt.contains("expert Rust developer"));
        assert!(prompt.contains("refactor the module"));
    }

    // ── SSE parser tests ──

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
