//! FileEdit tool: applies a search-and-replace patch to a file.
//!
//! Searches for `old_string` in the file and replaces it with `new_string`.
//! Only replaces the first occurrence (for safety).

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct FileEditTool;

impl Tool for FileEditTool {
    fn name(&self) -> &'static str {
        "file_edit"
    }

    fn description(&self) -> &'static str {
        "Edit a file by replacing a specific string with new content. Only replaces the first occurrence."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file within the workspace"
                },
                "old_string": {
                    "type": "string",
                    "description": "The exact text to find and replace"
                },
                "new_string": {
                    "type": "string",
                    "description": "The replacement text"
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "If true, replace all occurrences of old_string. If false, replace only the first occurrence. (default false)"
                }
            },
            "required": ["path", "old_string", "new_string"]
        })
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let relative_path = input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let old_string = input
            .get("old_string")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let new_string = input
            .get("new_string")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let replace_all = input
            .get("replace_all")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        if relative_path.is_empty() {
            return ToolResult::error("No file path provided");
        }

        if old_string.is_empty() {
            return ToolResult::error("old_string cannot be empty");
        }

        // Path validation: prevent traversal attacks safely
        let resolved = match super::resolve_safe(&ctx.workspace_path, relative_path) {
            Ok(p) => p,
            Err(e) => return ToolResult::error(e),
        };

        let content = match std::fs::read_to_string(&resolved) {
            Ok(c) => c,
            Err(e) => return ToolResult::error(format!("Cannot read file: {}", e)),
        };

        // Find and replace (one or all occurrences)
        let edited = if content.contains(old_string) {
            if replace_all {
                content.replace(old_string, new_string)
            } else {
                content.replacen(old_string, new_string, 1)
            }
        } else {
            return ToolResult::error(format!(
                "old_string not found in file '{}'",
                relative_path
            ));
        };

        // Generate a simple diff for the result
        let diff = generate_minimal_diff(&content, &edited);

        // Atomic write
        let parent = resolved.parent().unwrap_or(&resolved);
        let file_name = resolved.file_name().and_then(|n| n.to_str()).unwrap_or("file");
        let temp_file = parent.join(format!("{}.tmp-{}", file_name, uuid::Uuid::new_v4()));

        if let Err(e) = std::fs::write(&temp_file, &edited) {
            let _ = std::fs::remove_file(&temp_file);
            return ToolResult::error(format!("Cannot write temp file: {}", e));
        }

        if let Err(e) = std::fs::rename(&temp_file, &resolved) {
            let _ = std::fs::remove_file(&temp_file);
            return ToolResult::error(format!("Cannot rename temp file to target: {}", e));
        }

        ToolResult::success(serde_json::json!({
            "status": "ok",
            "path": relative_path,
            "diff": diff,
            "lines_before": content.lines().count(),
            "lines_after": edited.lines().count(),
        }))
    }
}

/// Generate a minimal unified diff between original and edited text.
fn generate_minimal_diff(original: &str, edited: &str) -> String {
    let mut diff = String::new();
    let orig_lines: Vec<&str> = original.lines().collect();
    let edit_lines: Vec<&str> = edited.lines().collect();

    // Simple line-by-line diff
    let max_len = orig_lines.len().max(edit_lines.len());
    let mut i = 0;
    while i < max_len {
        let orig = orig_lines.get(i);
        let edit = edit_lines.get(i);
        if orig != edit {
            if let Some(o) = orig {
                diff.push_str(&format!("-{}\n", o));
            }
            if let Some(e) = edit {
                diff.push_str(&format!("+{}\n", e));
            }
        }
        i += 1;
    }

    if diff.is_empty() {
        diff = "(no changes)".to_string();
    }

    diff
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn simple_replace() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("src.rs"), "let x = 1;\nlet y = 2;\n").unwrap();

        let tool = FileEditTool;
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
                "path": "src.rs",
                "old_string": "let x = 1;",
                "new_string": "let x = 42;"
            }),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                assert_eq!(output["status"], "ok");
                let content = std::fs::read_to_string(tmp.path().join("src.rs")).unwrap();
                assert!(content.contains("let x = 42;"));
                assert!(!content.contains("let x = 1;"));
            }
            ToolResult::Error { message } => panic!("{}", message),
        }
    }

    #[test]
    fn old_string_not_found() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("file.txt"), "hello world\n").unwrap();

        let tool = FileEditTool;
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
                "path": "file.txt",
                "old_string": "nonexistent",
                "new_string": "replacement"
            }),
            &ctx,
        );

        match result {
            ToolResult::Error { message } => {
                assert!(message.contains("not found"));
            }
            _ => panic!("Expected error for missing old_string"),
        }
    }

    #[test]
    fn empty_old_string() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("file.txt"), "content\n").unwrap();

        let tool = FileEditTool;
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
                "path": "file.txt",
                "old_string": "",
                "new_string": "x"
            }),
            &ctx,
        );

        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn test_replace_all_multiple_occurrences() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("file.txt"), "foo bar foo baz\n").unwrap();

        let tool = FileEditTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
            event_tx: None,
        };

        // 1. replace_all = false (default)
        let result = tool.execute(
            serde_json::json!({
                "path": "file.txt",
                "old_string": "foo",
                "new_string": "qux"
            }),
            &ctx,
        );
        match result {
            ToolResult::Success { .. } => {
                let content = std::fs::read_to_string(tmp.path().join("file.txt")).unwrap();
                assert_eq!(content, "qux bar foo baz\n");
            }
            _ => panic!("Expected success"),
        }

        // 2. replace_all = true
        std::fs::write(tmp.path().join("file.txt"), "foo bar foo baz\n").unwrap();
        let result = tool.execute(
            serde_json::json!({
                "path": "file.txt",
                "old_string": "foo",
                "new_string": "qux",
                "replace_all": true
            }),
            &ctx,
        );
        match result {
            ToolResult::Success { .. } => {
                let content = std::fs::read_to_string(tmp.path().join("file.txt")).unwrap();
                assert_eq!(content, "qux bar qux baz\n");
            }
            _ => panic!("Expected success"),
        }
    }
}
