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

        // Resolve and validate path safely (prevents path traversal)
        let resolved = match super::resolve_safe(&ctx.workspace_path, relative_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };

        // Create parent directories
        if let Some(parent) = resolved.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                return ToolResult::error(format!("Cannot create parent directories: {}", e));
            }
        }

        // Atomic write
        let parent = resolved.parent().unwrap_or(&resolved);
        let file_name = resolved.file_name().and_then(|n| n.to_str()).unwrap_or("file");
        let temp_file = parent.join(format!("{}.tmp-{}", file_name, uuid::Uuid::new_v4()));

        if let Err(e) = std::fs::write(&temp_file, content) {
            let _ = std::fs::remove_file(&temp_file);
            return ToolResult::error(format!("Cannot write temp file {:?}: {}", temp_file, e));
        }

        if let Err(e) = std::fs::rename(&temp_file, &resolved) {
            let _ = std::fs::remove_file(&temp_file);
            return ToolResult::error(format!(
                "Cannot rename temp file {:?} to target {:?}: {}",
                temp_file, resolved, e
            ));
        }

        ToolResult::success(serde_json::json!({
            "status": "ok",
            "path": relative_path,
            "bytes_written": content.len(),
        }))
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
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
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
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
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
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
        };

        let result = tool.execute(
            serde_json::json!({"path": "", "content": "x"}),
            &ctx,
        );

        assert!(matches!(result, ToolResult::Error { .. }));
    }
}
