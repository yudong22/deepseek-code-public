//! Tool execution layer: Tool trait, registry, and 7 tool implementations.
//!
//! Tools are the actions the agent can perform. Each tool implements the
//! `Tool` trait and is registered in the agent's tool registry.

use serde::Serialize;
use std::path::PathBuf;

// ─── Tool Trait ──────────────────────────────────

/// Context passed to every tool execution.
#[derive(Debug, Clone)]
pub struct ToolContext {
    /// Absolute path to the workspace root (directory where the agent operates)
    pub workspace_path: PathBuf,
    /// Session identifier for tracing
    pub session_id: String,
    /// Call ID from the LLM (for event correlation)
    pub call_id: String,
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
}

// ─── Tool Registry ───────────────────────────────

/// A collection of registered tools.
pub struct ToolRegistry {
    tools: Vec<Box<dyn Tool>>,
}

impl ToolRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self { tools: vec![] }
    }

    /// Register a tool.
    pub fn register(&mut self, tool: Box<dyn Tool>) {
        self.tools.push(tool);
    }

    /// Find a tool by name.
    pub fn find(&self, name: &str) -> Option<&dyn Tool> {
        self.tools.iter().find(|t| t.name() == name).map(|t| t.as_ref())
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

/// Create the default tool registry with all 7 tools.
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
    registry
}
