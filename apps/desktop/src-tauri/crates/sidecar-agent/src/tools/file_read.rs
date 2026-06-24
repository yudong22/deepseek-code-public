//! FileRead tool: reads a file from the workspace with path traversal protection.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;
use std::path::PathBuf;

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
        let resolved = match resolve_safe(&ctx.workspace_path, relative_path) {
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

/// Resolve a relative path safely within the workspace root.
/// Prevents path traversal attacks (e.g., `../../etc/passwd`).
fn resolve_safe(workspace: &PathBuf, relative: &str) -> Result<PathBuf, String> {
    let resolved = workspace.join(relative);

    // Normalize the path (resolve `..` and `.` components) without requiring existence
    let normalized = normalize_path(&resolved);

    // Canonicalize workspace for comparison (handles symlinks like /tmp → /private/tmp)
    let workspace_canon = workspace
        .canonicalize()
        .map_err(|e| format!("Cannot resolve workspace path: {}", e))?;

    // Try canonicalize on the target; if it fails (file may not exist yet),
    // canonicalize the parent and join the filename
    let resolved_canon = match normalized.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            // File doesn't exist — canonicalize parent directory instead
            let parent = normalized.parent().unwrap_or(&normalized);
            let parent_canon = parent.canonicalize().unwrap_or(parent.to_path_buf());
            let filename = normalized.file_name().unwrap_or_default();
            parent_canon.join(filename)
        }
    };

    // Verify the resolved path is within the workspace
    if !resolved_canon.starts_with(&workspace_canon) {
        return Err(format!(
            "Path traversal detected: '{}' is outside the workspace",
            relative
        ));
    }

    // Return the canonical path if it exists, otherwise the normalized path
    if resolved_canon.exists() {
        Ok(resolved_canon)
    } else {
        Ok(normalized)
    }
}

/// Normalize a path by resolving `..` and `.` components without touching the filesystem.
fn normalize_path(path: &std::path::Path) -> PathBuf {
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
        };

        let result = tool.execute(
            serde_json::json!({"path": "nonexistent.txt"}),
            &ctx,
        );

        assert!(matches!(result, ToolResult::Error { .. }));
    }
}
