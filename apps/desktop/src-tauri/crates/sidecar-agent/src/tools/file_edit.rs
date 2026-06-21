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

        if relative_path.is_empty() {
            return ToolResult::error("No file path provided");
        }

        if old_string.is_empty() {
            return ToolResult::error("old_string cannot be empty");
        }

        // Path validation: prevent traversal attacks
        let resolved = ctx.workspace_path.join(relative_path);
        let workspace_canon = ctx.workspace_path.canonicalize().unwrap_or_else(|_| ctx.workspace_path.clone());
        let file_canon = resolved.canonicalize().unwrap_or_else(|_| resolved.clone());
        if !file_canon.starts_with(&workspace_canon) && !resolved.starts_with(&ctx.workspace_path) {
            return ToolResult::error(format!(
                "Path traversal detected: '{}' is outside the workspace",
                relative_path
            ));
        }

        let content = match std::fs::read_to_string(&resolved) {
            Ok(c) => c,
            Err(e) => return ToolResult::error(format!("Cannot read file: {}", e)),
        };

        // Find and replace exactly one occurrence
        let edited = match content.find(old_string) {
            Some(_pos) => content.replacen(old_string, new_string, 1),
            None => {
                return ToolResult::error(format!(
                    "old_string not found in file '{}'",
                    relative_path
                ));
            }
        };

        // Generate a simple diff for the result
        let diff = generate_minimal_diff(&content, &edited);

        match std::fs::write(&resolved, &edited) {
            Ok(_) => ToolResult::success(serde_json::json!({
                "status": "ok",
                "path": relative_path,
                "diff": diff,
                "lines_before": content.lines().count(),
                "lines_after": edited.lines().count(),
            })),
            Err(e) => ToolResult::error(format!("Cannot write file: {}", e)),
        }
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
}
