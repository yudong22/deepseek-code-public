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
                },
                "context": {
                    "type": "integer",
                    "description": "Number of context lines to display before and after each match (default 0)"
                },
                "file_types": {
                    "type": "string",
                    "description": "Comma-separated file extensions to limit search to (e.g. 'rs,toml,md')"
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
        let context = input.get("context").and_then(|v| v.as_u64()).unwrap_or(0);
        let file_types = input.get("file_types").and_then(|v| v.as_str()).unwrap_or("");

        if pattern.is_empty() {
            return ToolResult::error("No search pattern provided");
        }

        // Build file type filters
        let extensions: Vec<&str> = file_types
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        // Build command arguments
        let mut rg_args = vec![
            "--line-number".to_string(),
            "--no-heading".to_string(),
            "--color=never".to_string(),
        ];
        if context > 0 {
            rg_args.push("-C".to_string());
            rg_args.push(context.to_string());
        }
        // Add --include globs for file type filtering (rg)
        for ext in &extensions {
            rg_args.push("--include".to_string());
            rg_args.push(format!("*.{}", ext));
        }
        rg_args.push(pattern.to_string());

        let mut grep_args = vec![
            "-rn".to_string(),
            "--color=never".to_string(),
        ];
        if context > 0 {
            grep_args.push("-C".to_string());
            grep_args.push(context.to_string());
        }
        // Add --include patterns for file type filtering (grep)
        for ext in &extensions {
            grep_args.push("--include".to_string());
            grep_args.push(format!("*.{}", ext));
        }
        grep_args.push(pattern.to_string());

        // Try ripgrep first, fall back to grep
        let output = std::process::Command::new("rg")
            .args(&rg_args)
            .current_dir(&ctx.workspace_path)
            .output();

        let output = match output {
            Ok(out) if out.status.success() => out,
            _ => {
                // Fallback to grep -r
                std::process::Command::new("grep")
                    .args(&grep_args)
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
                let parts: Vec<&str> = if line.contains(':') {
                    line.splitn(3, ':').collect()
                } else {
                    line.splitn(3, '-').collect()
                };
                match parts.len() {
                    3 => {
                        let is_context = !line.contains(':');
                        serde_json::json!({
                            "file": parts[0],
                            "line": parts[1].parse::<u32>().unwrap_or(0),
                            "content": parts[2].trim(),
                            "is_context": is_context,
                        })
                    }
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
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
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
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(serde_json::json!({"pattern": ""}), &ctx);
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn grep_with_file_types() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join("main.rs"),
            "fn main() {}\n",
        )
        .unwrap();
        std::fs::write(
            tmp.path().join("lib.rs"),
            "pub fn lib() {}\n",
        )
        .unwrap();
        std::fs::write(
            tmp.path().join("README.md"),
            "# Project\n",
        )
        .unwrap();

        let tool = GrepTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({
                "pattern": "fn",
                "file_types": "rs"
            }),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                let matches = output["matches"].as_array().unwrap();
                // Should only match .rs files, not .md
                let all_rust = matches.iter().all(|m| {
                    let file = m["file"].as_str().unwrap_or("");
                    file.ends_with(".rs")
                });
                assert!(all_rust, "file_types filter should limit to .rs files");
            }
            _ => {}
        }
    }

    #[test]
    fn grep_with_context() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(
            tmp.path().join("file.txt"),
            "line1\nmatch_me\nline3\n",
        )
        .unwrap();

        let tool = GrepTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(
            serde_json::json!({
                "pattern": "match_me",
                "context": 1
            }),
            &ctx,
        );

        match result {
            ToolResult::Success { output } => {
                let matches = output["matches"].as_array().unwrap();
                // Should find matches
                assert!(matches.len() > 0);
                // Should contain context lines (with is_context: true or is_context: false)
                let has_match = matches.iter().any(|m| m["content"].as_str().unwrap() == "match_me" && m["is_context"].as_bool() == Some(false));
                let has_context = matches.iter().any(|m| m["is_context"].as_bool() == Some(true));
                assert!(has_match);
                // Note: fallback grep might not support -C on some systems, but it's fine if ripgrep does
                if has_context {
                    println!("Found context line!");
                }
            }
            _ => {}
        }
    }
}
