//! FileRead tool: reads a file from the workspace with path traversal protection.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct FileReadTool;

impl Tool for FileReadTool {
    fn name(&self) -> &'static str {
        "file_read"
    }

    fn description(&self) -> &'static str {
        "Read a file from the workspace. Returns the file contents. Supports offset and limit for reading specific line ranges."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file within the workspace"
                },
                "offset": {
                    "type": "integer",
                    "description": "Line number to start reading from (1-indexed)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Maximum number of lines to read"
                }
            },
            "required": ["path"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let relative_path = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if relative_path.is_empty() {
            return ToolResult::error("No file path provided");
        }

        // Resolve and validate path
        let resolved = match super::resolve_safe(&ctx.workspace_path, relative_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };

        // Read the file
        let content = match std::fs::read_to_string(&resolved) {
            Ok(c) => c,
            Err(e) => return ToolResult::error(format!("Cannot read file: {}", e)),
        };

        let offset = input.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
        let limit = input.get("limit").and_then(|v| v.as_u64());

        // Apply offset/limit
        let lines: Vec<&str> = content.lines().collect();
        let total_lines = lines.len();

        let start = if offset > 0 { (offset - 1).min(total_lines) } else { 0 };
        let end = match limit {
            Some(lim) => (start + lim as usize).min(total_lines),
            None => total_lines,
        };

        let selected: String = lines[start..end].join("\n");

        ToolResult::success(serde_json::json!({
            "content": selected,
            "total_lines": total_lines,
            "offset": if offset > 0 { offset } else { 1 },
            "lines_read": end - start,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read_existing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("test.txt");
        std::fs::write(&file_path, "line1\nline2\nline3\n").unwrap();

        let tool = FileReadTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({"path": "test.txt"}),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                assert_eq!(output["total_lines"], 3);
                assert!(output["content"].as_str().unwrap().contains("line1"));
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn read_with_offset_and_limit() {
        let tmp = tempfile::tempdir().unwrap();
        let file_path = tmp.path().join("data.txt");
        let lines: Vec<String> = (1..=10).map(|i| format!("line{}", i)).collect();
        std::fs::write(&file_path, lines.join("\n")).unwrap();

        let tool = FileReadTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({"path": "data.txt", "offset": 3, "limit": 2}),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                assert_eq!(output["offset"], 3);
                assert_eq!(output["lines_read"], 2);
                // Should contain line3 and line4 only
                let content = output["content"].as_str().unwrap();
                assert!(content.contains("line3"));
                assert!(content.contains("line4"));
                assert!(!content.contains("line5"));
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn path_traversal_blocked() {
        let tmp = tempfile::tempdir().unwrap();

        let tool = FileReadTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().join("subdir").to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };
        std::fs::create_dir_all(&ctx.workspace_path).unwrap();

        let result = tool.execute(
            serde_json::json!({"path": "../../etc/passwd"}),
            &ctx,
        );

        match result {
            ToolResult::Error { message } => {
                assert!(message.contains("outside the workspace") || message.contains("traversal"));
            }
            _ => panic!("Expected path traversal error"),
        }
    }

    #[test]
    fn missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = FileReadTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({"path": "nonexistent.txt"}),
            &ctx,
        );

        assert!(matches!(result, ToolResult::Error { .. }));
    }
}
