//! FileWrite tool: writes content to a file in the workspace.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct FileWriteTool;

impl Tool for FileWriteTool {
    fn name(&self) -> &'static str {
        "file_write"
    }

    fn description(&self) -> &'static str {
        "Write content to a file in the workspace. Creates parent directories if needed."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file within the workspace"
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file"
                }
            },
            "required": ["path", "content"]
        })
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let relative_path = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let content = input
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if relative_path.is_empty() {
            return ToolResult::error("No file path provided");
        }

        let resolved = ctx.workspace_path.join(relative_path);

        // Canonicalize parent for safety check
        let resolved_canon = resolved.canonicalize().unwrap_or(resolved.clone());
        let workspace_canon = match ctx.workspace_path.canonicalize() {
            Ok(p) => p,
            Err(e) => return ToolResult::error(format!("Cannot resolve workspace: {}", e)),
        };

        if !resolved_canon.starts_with(&workspace_canon) && !resolved.starts_with(&ctx.workspace_path) {
            return ToolResult::error(format!(
                "Path traversal detected: '{}' is outside the workspace",
                relative_path
            ));
        }

        // Create parent directories
        if let Some(parent) = resolved.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return ToolResult::error(format!("Cannot create parent directories: {}", e));
            }
        }

        // Write the file
        match std::fs::write(&resolved, content) {
            Ok(_) => ToolResult::success(serde_json::json!({
                "status": "ok",
                "path": relative_path,
                "bytes_written": content.len(),
            })),
            Err(e) => ToolResult::error(format!("Cannot write file: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_new_file() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = FileWriteTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };

        let result = tool.execute(
            serde_json::json!({
                "path": "output.txt",
                "content": "Hello, world!"
            }),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                assert_eq!(output["status"], "ok");
                assert!(tmp.path().join("output.txt").exists());
                let content = std::fs::read_to_string(tmp.path().join("output.txt")).unwrap();
                assert_eq!(content, "Hello, world!");
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn write_to_subdirectory() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = FileWriteTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };

        let result = tool.execute(
            serde_json::json!({
                "path": "nested/deep/file.txt",
                "content": "nested content"
            }),
            &ctx,
        );

        assert!(matches!(result, ToolResult::Success { .. }));
        assert!(tmp.path().join("nested/deep/file.txt").exists());
        let content = std::fs::read_to_string(tmp.path().join("nested/deep/file.txt")).unwrap();
        assert_eq!(content, "nested content");
    }

    #[test]
    fn write_empty_path() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = FileWriteTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };

        let result = tool.execute(
            serde_json::json!({"path": "", "content": "x"}),
            &ctx,
        );

        assert!(matches!(result, ToolResult::Error { .. }));
    }
}
