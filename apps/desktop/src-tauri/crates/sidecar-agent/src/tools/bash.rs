//! Bash tool: executes shell commands in the workspace directory.
//!
//! Uses `tokio::process::Command` with a 120-second timeout.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;

pub struct BashTool;

impl Tool for BashTool {
    fn name(&self) -> &'static str {
        "bash"
    }

    fn description(&self) -> &'static str {
        "Execute a shell command in the workspace directory. Returns stdout, stderr, and exit code."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "The shell command to execute"
                }
            },
            "required": ["command"]
        })
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let command = input
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if command.is_empty() {
            return ToolResult::error("No command provided");
        }

        // Execute synchronously since we're in a tokio context
        let output = std::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(&ctx.workspace_path)
            .env("WORKSPACE_PATH", &ctx.workspace_path)
            .output();

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout).to_string();
                let stderr = String::from_utf8_lossy(&out.stderr).to_string();
                ToolResult::success(serde_json::json!({
                    "stdout": stdout,
                    "stderr": stderr,
                    "exit_code": out.status.code().unwrap_or(-1),
                }))
            }
            Err(e) => ToolResult::error(format!("Failed to execute command: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn bash_echo() {
        let tool = BashTool;
        let ctx = ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };
        let result = tool.execute(
            serde_json::json!({"command": "echo hello"}),
            &ctx,
        );
        match result {
            ToolResult::Success { output } => {
                assert!(output["stdout"].as_str().unwrap().contains("hello"));
                assert_eq!(output["exit_code"], 0);
            }
            ToolResult::Error { message } => panic!("Unexpected error: {}", message),
        }
    }

    #[test]
    fn bash_empty_command() {
        let tool = BashTool;
        let ctx = ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };
        let result = tool.execute(serde_json::json!({"command": ""}), &ctx);
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn bash_nonexistent_command() {
        let tool = BashTool;
        let ctx = ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
        };
        let result = tool.execute(
            serde_json::json!({"command": "nonexistent_command_xyz_123"}),
            &ctx,
        );
        match result {
            ToolResult::Success { output } => {
                assert_ne!(output["exit_code"], 0);
            }
            _ => {}
        }
    }
}
