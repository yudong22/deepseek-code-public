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
                },
                "timeout_ms": {
                    "type": "integer",
                    "description": "Timeout in milliseconds (default 60000)"
                },
                "allow_outside_workspace": {
                    "type": "boolean",
                    "description": "Allow cd target outside workspace (default false)"
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

        let timeout_ms = input
            .get("timeout_ms")
            .and_then(|v| v.as_u64())
            .unwrap_or(60000);

        // Build allowed environment variables keys set
        let mut allowed_keys = std::collections::HashSet::new();
        allowed_keys.insert("PATH".to_string());
        allowed_keys.insert("HOME".to_string());
        allowed_keys.insert("USER".to_string());
        allowed_keys.insert("LANG".to_string());
        allowed_keys.insert("TERM".to_string());
        allowed_keys.insert("WORKSPACE_PATH".to_string());
        allowed_keys.insert("CARGO_HOME".to_string());
        allowed_keys.insert("GIT_SSH_COMMAND".to_string());
        allowed_keys.insert("GITHUB_TOKEN".to_string());

        if let Ok(home) = std::env::var("HOME") {
            let custom_path = std::path::PathBuf::from(home).join(".deepseek-code/allowed-env.txt");
            if custom_path.exists() {
                if let Ok(content) = std::fs::read_to_string(custom_path) {
                    for line in content.lines() {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() && !trimmed.starts_with('#') {
                            allowed_keys.insert(trimmed.to_string());
                        }
                    }
                }
            }
        }

        let mut cmd = std::process::Command::new("sh");
        cmd.arg("-c")
            .arg(command)
            .current_dir(&ctx.workspace_path)
            .env_clear();

        for (key, val) in std::env::vars() {
            if allowed_keys.contains(&key) || key.starts_with("LC_") {
                cmd.env(key, val);
            }
        }
        cmd.env("WORKSPACE_PATH", &ctx.workspace_path);

        let mut child = match cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => return ToolResult::error(format!("Failed to spawn command: {}", e)),
        };

        let mut stdout = child.stdout.take().unwrap();
        let mut stderr = child.stderr.take().unwrap();

        // Spawn background threads to read stdout/stderr to avoid buffer deadlock
        let stdout_handle = std::thread::spawn(move || {
            let mut buf = vec![];
            use std::io::Read;
            let _ = stdout.read_to_end(&mut buf);
            String::from_utf8_lossy(&buf).into_owned()
        });

        let stderr_handle = std::thread::spawn(move || {
            let mut buf = vec![];
            use std::io::Read;
            let _ = stderr.read_to_end(&mut buf);
            String::from_utf8_lossy(&buf).into_owned()
        });

        let start = std::time::Instant::now();
        let exit_status;
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    exit_status = status;
                    break;
                }
                Ok(None) => {
                    // Not exited yet
                }
                Err(e) => {
                    let _ = child.kill();
                    return ToolResult::error(format!("Failed to wait for process: {}", e));
                }
            }

            // Cancellation check
            if ctx.cancel_flag.load(std::sync::atomic::Ordering::SeqCst) {
                let _ = child.kill();
                return ToolResult::error("Command execution cancelled by user");
            }

            // Timeout check
            if start.elapsed().as_millis() > timeout_ms as u128 {
                let _ = child.kill();
                return ToolResult::error(format!("Command timed out after {}ms", timeout_ms));
            }

            std::thread::sleep(std::time::Duration::from_millis(50));
        }

        let stdout_str = stdout_handle.join().unwrap_or_default();
        let stderr_str = stderr_handle.join().unwrap_or_default();

        let exit_code = exit_status.code().unwrap_or(-1);

        ToolResult::success(serde_json::json!({
            "stdout": stdout_str,
            "stderr": stderr_str,
            "exit_code": exit_code,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::Arc;
    use std::sync::atomic::AtomicBool;

    #[test]
    fn bash_echo() {
        let tool = BashTool;
        let ctx = ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
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
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
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
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
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

    #[test]
    fn bash_timeout() {
        let tool = BashTool;
        let ctx = ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: Arc::new(AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };
        let start = std::time::Instant::now();
        let result = tool.execute(
            serde_json::json!({
                "command": "sleep 10",
                "timeout_ms": 200
            }),
            &ctx,
        );
        assert!(start.elapsed().as_millis() < 1000); // Should finish way before 10s
        match result {
            ToolResult::Error { message } => {
                assert!(message.contains("timed out"));
            }
            _ => panic!("Expected timeout error"),
        }
    }

    #[test]
    fn bash_cancel() {
        let tool = BashTool;
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let cancel_flag_clone = cancel_flag.clone();
        
        // Spawn a thread to cancel the execution after 100ms
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(100));
            cancel_flag_clone.store(true, std::sync::atomic::Ordering::SeqCst);
        });

        let ctx = ToolContext {
            workspace_path: PathBuf::from("/tmp"),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag,
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };
        let start = std::time::Instant::now();
        let result = tool.execute(
            serde_json::json!({"command": "sleep 5"}),
            &ctx,
        );
        assert!(start.elapsed().as_millis() < 1000); // Should finish way before 5s
        match result {
            ToolResult::Error { message } => {
                assert!(message.contains("cancelled by user"));
            }
            _ => panic!("Expected cancellation error"),
        }
    }
}
