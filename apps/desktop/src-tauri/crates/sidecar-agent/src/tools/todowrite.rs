//! TodoWrite tool: manages a structured task list for the agent.
//!
//! The tool accepts a full `todos` array (merge semantic — replaces all todos
//! for the current session) and emits a `TodoUpdated` event through the agent
//! loop so the frontend can display the list persistently.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct TodoWriteTool;

impl Tool for TodoWriteTool {
    fn name(&self) -> &'static str {
        "todowrite"
    }

    fn description(&self) -> &'static str {
        "Create and manage a structured task list for your current coding session. \
         The todos array replaces all previous todos (merge-on-write). \
         Each todo must have 'content' (string), 'status' (one of: pending, in_progress, completed), \
         and optionally 'activeForm' (a user-facing label for the action in progress)."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "todos": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "content": {
                                "type": "string",
                                "description": "The task description"
                            },
                            "status": {
                                "type": "string",
                                "enum": ["pending", "in_progress", "completed"],
                                "description": "Current status of the task"
                            },
                            "activeForm": {
                                "type": "string",
                                "description": "User-facing verb phrase shown when this task is active"
                            }
                        },
                        "required": ["content", "status"]
                    }
                }
            },
            "required": ["todos"]
        })
    }

    fn execute(&self, input: Value, _ctx: &ToolContext) -> ToolResult {
        let todos = match input.get("todos").and_then(|v| v.as_array()) {
            Some(arr) => arr,
            None => return ToolResult::error("Missing or invalid 'todos' array"),
        };

        // Validate each todo entry
        for (i, t) in todos.iter().enumerate() {
            let obj = match t.as_object() {
                Some(o) => o,
                None => return ToolResult::error(format!("todo[{}] is not an object", i)),
            };
            if !obj.contains_key("content") || obj.get("content").and_then(|v| v.as_str()).is_none() {
                return ToolResult::error(format!("todo[{}] missing required field 'content'", i));
            }
            if let Some(status) = obj.get("status").and_then(|v| v.as_str()) {
                if !["pending", "in_progress", "completed"].contains(&status) {
                    return ToolResult::error(format!(
                        "todo[{}] invalid status '{}'. Must be one of: pending, in_progress, completed",
                        i, status
                    ));
                }
            } else {
                return ToolResult::error(format!("todo[{}] missing required field 'status'", i));
            }
        }

        // Return the validated todos — agent loop will emit TodoUpdated event with them
        ToolResult::success(serde_json::json!({ "todos": todos }))
    }

    /// TodoWrite modifies in-memory session state; not safe for parallel execution.
    fn is_read_only(&self) -> bool {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    fn test_ctx() -> ToolContext {
        ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
        }
    }

    #[test]
    fn todowrite_valid_todos() {
        let tool = TodoWriteTool;
        let input = serde_json::json!({
            "todos": [
                { "content": "Task A", "status": "pending" },
                { "content": "Task B", "status": "in_progress", "activeForm": "Running Task B" },
                { "content": "Task C", "status": "completed" }
            ]
        });
        let result = tool.execute(input, &test_ctx());
        match result {
            ToolResult::Success { output } => {
                assert_eq!(output["todos"].as_array().unwrap().len(), 3);
            }
            ToolResult::Error { message } => panic!("Unexpected error: {}", message),
        }
    }

    #[test]
    fn todowrite_rejects_invalid_status() {
        let tool = TodoWriteTool;
        let input = serde_json::json!({
            "todos": [
                { "content": "Bad", "status": "wrong" }
            ]
        });
        let result = tool.execute(input, &test_ctx());
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn todowrite_rejects_missing_content() {
        let tool = TodoWriteTool;
        let input = serde_json::json!({
            "todos": [
                { "status": "pending" }
            ]
        });
        let result = tool.execute(input, &test_ctx());
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn todowrite_rejects_missing_todos_field() {
        let tool = TodoWriteTool;
        let result = tool.execute(serde_json::json!({}), &test_ctx());
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn todowrite_empty_todos_allowed() {
        let tool = TodoWriteTool;
        let input = serde_json::json!({ "todos": [] });
        let result = tool.execute(input, &test_ctx());
        assert!(matches!(result, ToolResult::Success { .. }));
    }
}
