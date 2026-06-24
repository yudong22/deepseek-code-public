//! Grep tool: searches for patterns in workspace files using ripgrep.
//!
//! Falls back to `grep -r` if `rg` is not available.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct GrepTool;

impl Tool for GrepTool {
    fn name(&self) -> &'static str {
        "grep"
    }

    fn description(&self) -> &'static str {
        "Search for a pattern in workspace files. Returns matching lines with file paths and line numbers."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "The regex pattern to search for"
                }
            },
            "required": ["pattern"]
        })
    }

    fn is_read_only(&self) -> bool {
        true
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let pattern = input
            .get("pattern")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if pattern.is_empty() {
            return ToolResult::error("No search pattern provided");
        }

        // Try ripgrep first, fall back to grep
        let output = std::process::Command::new("rg")
            .args(["--line-number", "--no-heading", "--color=never", pattern])
            .current_dir(&ctx.workspace_path)
            .output();

        let output = match output {
            Ok(out) if out.status.success() => out,
            _ => {
                // Fallback to grep -r
                std::process::Command::new("grep")
                    .args(["-rn", "--color=never", pattern])
                    .current_dir(&ctx.workspace_path)
                    .output()
                    .unwrap_or_else(|e| {
                        std::process::Output {
                            status: std::process::ExitStatus::default(),
                            stdout: vec![],
                            stderr: format!("grep failed: {}", e).into_bytes(),
                        }
                    })
            }
        };

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        // Parse results into structured format
        let matches: Vec<Value> = stdout
            .lines()
            .filter(|l| !l.is_empty())
            .take(100) // Limit to 100 matches
            .map(|line| {
                let parts: Vec<&str> = line.splitn(3, ':').collect();
                match parts.len() {
                    3 => serde_json::json!({
                        "file": parts[0],
                        "line": parts[1].parse::<u32>().unwrap_or(0),
                        "content": parts[2].trim(),
                    }),
                    _ => serde_json::json!({
                        "raw": line,
                    }),
                }
            })
            .collect();

        ToolResult::success(serde_json::json!({
            "matches": matches,
            "total_matches": stdout.lines().filter(|l| !l.is_empty()).count(),
            "stderr": stderr,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grep_finds_pattern() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("src")).unwrap();
        std::fs::write(
            tmp.path().join("src/main.rs"),
            "fn main() {\n    println!(\"hello\");\n}\n",
        )
        .unwrap();

        let tool = GrepTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };

        let result = tool.execute(serde_json::json!({"pattern": "main"}), &ctx);

        match result {
            ToolResult::Success { output } => {
                assert!(output["total_matches"].as_u64().unwrap() > 0);
                let matches = output["matches"].as_array().unwrap();
                assert!(matches.iter().any(|m| m["file"].as_str().unwrap().contains("main.rs")));
            }
            ToolResult::Error { message } => {
                // If rg/grep not available, this is acceptable
                eprintln!("grep test note: {}", message);
            }
        }
    }

    #[test]
    fn grep_empty_pattern() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = GrepTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };

        let result = tool.execute(serde_json::json!({"pattern": ""}), &ctx);
        assert!(matches!(result, ToolResult::Error { .. }));
    }
}
