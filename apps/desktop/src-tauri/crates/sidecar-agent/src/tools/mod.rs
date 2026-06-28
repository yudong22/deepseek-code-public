//! Tool execution layer: Tool trait, registry, and 7 tool implementations.
//!
//! Tools are the actions the agent can perform. Each tool implements the
//! `Tool` trait and is registered in the agent's tool registry.

use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

// ─── Tool Context ──────────────────────────────────

/// Context passed to every tool execution.
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// Absolute path to the workspace root (directory where the agent operates)
    pub workspace_path: PathBuf,
    /// Session identifier for tracing
    pub session_id: String,
    /// Call ID from the LLM (for event correlation)
    pub call_id: String,
    /// Cancellation flag checked by the tool
    pub cancel_flag: Arc<AtomicBool>,
    /// Provider configuration for nested LLM queries (e.g. WebFetch summaries)
    pub provider_config: crate::provider::ProviderConfig,
}

/// Result of a tool execution.
#[derive(Debug, Clone)]
pub enum ToolResult {
    /// Tool executed successfully with JSON-serializable output
    Success { output: serde_json::Value },
    /// Tool failed with an error message
    Error { message: String },
}

impl ToolResult {
    /// Create a success result from any JSON-serializable value.
    pub fn success(value: impl Serialize) -> Self {
        ToolResult::Success {
            output: serde_json::to_value(value).unwrap_or(serde_json::Value::Null),
        }
    }

    /// Create an error result.
    pub fn error(message: impl Into<String>) -> Self {
        ToolResult::Error {
            message: message.into(),
        }
    }
}

/// The Tool trait — every tool the agent can use implements this.
pub trait Tool: Send + Sync {
    /// Unique tool name exposed to the LLM (e.g., "bash", "file_read").
    fn name(&self) -> &'static str;

    /// Human-readable description for the LLM's function calling.
    fn description(&self) -> &'static str;

    /// JSON Schema for the tool's input parameters (OpenAI function calling format).
    fn input_schema(&self) -> serde_json::Value;

    /// Execute the tool with the given input and context.
    fn execute(&self, input: serde_json::Value, ctx: &ToolContext) -> ToolResult;

    /// Whether this tool is read-only (safe to run in parallel with other read-only tools).
    ///
    /// Read-only tools don't modify the filesystem — they can be executed concurrently
    /// without side-effect conflicts. Mutating tools (bash, file_write, file_edit, question)
    /// must run serially.
    fn is_read_only(&self) -> bool {
        false
    }
}

// ─── Tool Registry ───────────────────────────────

/// A collection of registered tools.
///
/// Internally stores tools as `Arc<dyn Tool>` so that `find()` returns an
/// owned `Arc` — callers can clone it and run the tool in a separate thread
/// for parallel execution.
pub struct ToolRegistry {
    tools: Vec<Arc<dyn Tool>>,
}

impl ToolRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self { tools: vec![] }
    }

    /// Register a tool from a `Box<dyn Tool>`.
    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.push(Arc::from(tool));
    }

    /// Register a tool from an existing `Arc<dyn Tool>`.
    /// Used when filtering/cloning registries (e.g., SubAgent tool permissions).
    pub fn register_from_arc(&mut self, tool: Arc<dyn Tool>) {
        self.tools.push(tool);
    }

    /// Find a tool by name. Returns an `Arc` so the caller can move it into
    /// a separate thread for parallel tool execution.
    pub fn find(&self, name: &str) -> Option<Arc<dyn Tool>> {
        self.tools.iter().find(|t| t.name() == name).map(|t| Arc::clone(t))
    }

    /// Get all tool definitions for the LLM API request.
    pub fn definitions(&self) -> Vec<crate::provider::ToolDef> {
        self.tools
            .iter()
            .map(|t| crate::provider::ToolDef {
                tool_type: "function".to_string(),
                function: crate::provider::FunctionDef {
                    name: t.name().to_string(),
                    description: t.description().to_string(),
                    parameters: t.input_schema(),
                },
            })
            .collect()
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}

// ─── Tool Implementations ────────────────────────

pub mod bash;
pub mod file_edit;
pub mod file_read;
pub mod file_write;
pub mod glob;
pub mod grep;
pub mod question;
pub mod subagent;
pub mod todowrite;
pub mod webfetch;
pub mod websearch;

/// Create the default tool registry with all 11 tools.
/// The question tool answer flow is handled at the agent loop level.
pub fn default_registry() -> ToolRegistry {
    let mut registry = ToolRegistry::new();
    registry.register(Box::new(bash::BashTool));
    registry.register(Box::new(file_read::FileReadTool));
    registry.register(Box::new(file_write::FileWriteTool));
    registry.register(Box::new(file_edit::FileEditTool));
    registry.register(Box::new(grep::GrepTool));
    registry.register(Box::new(glob::GlobTool));
    registry.register(Box::new(question::QuestionTool));
    registry.register(Box::new(todowrite::TodoWriteTool));
    registry.register(Box::new(webfetch::WebFetchTool));
    registry.register(Box::new(subagent::SubAgentTool));
    // websearch disabled for now: DeepSeek enable_search hallucinates URLs.
    // Re-enable when a provider with true web search (e.g. Brave API) is integrated.
    // registry.register(Box::new(websearch::WebSearchTool));
    registry
}

/// Resolve a relative path safely within the workspace root.
/// Prevents path traversal attacks (e.g., `../../etc/passwd`).
pub fn resolve_safe(workspace: &std::path::Path, relative: &str) -> Result<PathBuf, String> {
    let resolved = workspace.join(relative);

    // Normalize the path (resolve `..` and `.` components) without requiring existence
    let normalized = normalize_path(&resolved);

    // Canonicalize workspace for comparison (handles symlinks like /tmp → /private/tmp)
    let workspace_canon = workspace
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace path: {}", e))?;

    // Try canonicalize on the target or the closest existing ancestor to preserve symlink resolution
    let resolved_canon = if let Ok(p) = normalized.canonicalize() {
        p
    } else {
        let mut current = normalized.clone();
        let mut suffix = std::path::PathBuf::new();
        loop {
            if current.exists() {
                if let Ok(canon) = current.canonicalize() {
                    if suffix.as_os_str().is_empty() {
                        current = canon;
                    } else {
                        current = canon.join(suffix);
                    }
                    break;
                }
            }
            if let Some(parent) = current.parent() {
                if let Some(file_name) = current.file_name() {
                    if suffix.as_os_str().is_empty() {
                        suffix = std::path::PathBuf::from(file_name);
                    } else {
                        suffix = std::path::PathBuf::from(file_name).join(suffix);
                    }
                }
                current = parent.to_path_buf();
            } else {
                current = normalized.clone();
                break;
            }
        }
        current
    };

    // Verify the resolved path is within the workspace
    if !resolved_canon.starts_with(&workspace_canon) {
        return Err(format!(
            "Path traversal detected: '{}' is outside the workspace",
            relative
        ));
    }

    // Return the canonical path if it exists, otherwise the resolved_canon (which contains canonical ancestor)
    Ok(resolved_canon)
}

/// Normalize a path by resolving `..` and `.` components without touching the filesystem.
pub fn normalize_path(path: &std::path::Path) -> PathBuf {
    let mut components = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                components.pop();
            }
            std::path::Component::CurDir => {}
            c => components.push(c),
        }
    }
    components.iter().collect()
}
