//! SubAgent tool: delegates a coding task to an external CLI agent (Claude Code, Antigravity).
//!
//! Spawns the CLI binary as a subprocess in the workspace directory, waits for
//! completion, and returns the output to the main agent.
//!
//! Supported agents:
//! - `cc` (Claude Code) — `cc -p "<prompt>" --output-format text`
//! - `antigravity` — `antigravity run "<prompt>"`
//!
//! Configurable via `subagent_mode`: "cc" (default), "antigravity", "auto" (try cc first, fallback).
//! Timeout: 180s default.

use super::{Tool, ToolContext, ToolResult};
use serde_json::Value;
use std::process::Command;
use std::time::{Duration, Instant};

const DEFAULT_TIMEOUT_SECS: u64 = 180;

pub struct SubAgentTool;

impl Tool for SubAgentTool {
    fn name(&self) -> &'static str {
        "subagent"
    }

    fn description(&self) -> &'static str {
        "Delegate a coding task to an external AI agent (Claude Code 'cc' or Antigravity).\
         Use for complex multi-step tasks that benefit from focused sub-agent execution.\
         Returns the sub-agent's output. The sub-agent has its own file read/write access\
         within the workspace."
    }

    fn input_schema(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The task for the sub-agent to perform. Be specific and include file paths and expected outcomes."
                },
                "description": {
                    "type": "string",
                    "description": "Short description of what this sub-agent should do (shown in UI)"
                },
                "subagent_mode": {
                    "type": "string",
                    "enum": ["cc", "antigravity", "auto"],
                    "description": "Which CLI agent to use: 'cc' (Claude Code, default), 'antigravity', or 'auto' (try cc first)"
                }
            },
            "required": ["prompt"]
        })
    }

    fn is_read_only(&self) -> bool {
        false // SubAgent can write files
    }

    fn execute(&self, input: Value, ctx: &ToolContext) -> ToolResult {
        let prompt = input
            .get("prompt")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let description = input
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("(unnamed)");
        let mode = input
            .get("subagent_mode")
            .and_then(|v| v.as_str())
            .unwrap_or("auto");

        if prompt.is_empty() {
            return ToolResult::error("SubAgent requires a non-empty prompt");
        }

        // Determine which binary to use
        let (binary, args) = match resolve_binary(mode) {
            Some(cmd) => cmd.build_args(prompt),
            None => {
                return ToolResult::error(
                    "No sub-agent CLI found. Install Claude Code: npm i -g @anthropic-ai/claude-code"
                );
            }
        };

        let start = Instant::now();
        let timeout = Duration::from_secs(DEFAULT_TIMEOUT_SECS);

        // Spawn the sub-agent process
        let mut child = match Command::new(&binary)
            .args(&args)
            .current_dir(&ctx.workspace_path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                return ToolResult::error(format!(
                    "Failed to spawn sub-agent '{}': {}. Is it installed?",
                    binary, e
                ));
            }
        };

        // Wait with timeout, checking cancel flag periodically
        let output = loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let success = status.success();
                    let real_stdout = child
                        .stdout
                        .take()
                        .and_then(|mut o| {
                            use std::io::Read;
                            let mut buf = String::new();
                            o.read_to_string(&mut buf).ok().map(|_| buf)
                        })
                        .unwrap_or_default();
                    let stderr = child
                        .stderr
                        .take()
                        .and_then(|mut o| {
                            use std::io::Read;
                            let mut buf = String::new();
                            o.read_to_string(&mut buf).ok().map(|_| buf)
                        })
                        .unwrap_or_default();

                    break (success, real_stdout, stderr);
                }
                Ok(None) => {
                    // Still running
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return ToolResult::error(format!(
                            "Sub-agent '{}' timed out after {}s",
                            binary, DEFAULT_TIMEOUT_SECS
                        ));
                    }
                    if ctx.cancel_flag.load(std::sync::atomic::Ordering::Relaxed) {
                        let _ = child.kill();
                        let _ = child.wait();
                        return ToolResult::error("Sub-agent cancelled");
                    }
                    std::thread::sleep(Duration::from_millis(200));
                }
                Err(e) => {
                    return ToolResult::error(format!("Sub-agent process error: {}", e));
                }
            }
        };

        let (success, stdout, stderr) = output;
        let elapsed = start.elapsed().as_secs_f64().round() as u64;

        if success {
            ToolResult::success(serde_json::json!({
                "status": "ok",
                "agent": binary,
                "description": description,
                "output": stdout,
                "stderr": stderr,
                "elapsed_secs": elapsed,
            }))
        } else {
            ToolResult::error(format!(
                "Sub-agent '{}' exited with error ({}s):\nSTDOUT:\n{}\nSTDERR:\n{}",
                binary, elapsed,
                truncate_output(&stdout, 2000),
                truncate_output(&stderr, 500),
            ))
        }
    }
}

/// Resolve which CLI binary is available on the system.
enum ResolvedBinary {
    Cc,
    Antigravity,
}

impl ResolvedBinary {
    fn build_args(&self, prompt: &str) -> (String, Vec<String>) {
        match self {
            ResolvedBinary::Cc => (
                "cc".to_string(),
                vec![
                    "-p".to_string(),
                    prompt.to_string(),
                    "--output-format".to_string(),
                    "text".to_string(),
                ],
            ),
            ResolvedBinary::Antigravity => (
                "antigravity".to_string(),
                vec![
                    "run".to_string(),
                    prompt.to_string(),
                ],
            ),
        }
    }
}

fn resolve_binary(mode: &str) -> Option<ResolvedBinary> {
    match mode {
        "cc" => which_cc().map(|_| ResolvedBinary::Cc),
        "antigravity" => which_ag().map(|_| ResolvedBinary::Antigravity),
        "auto" => {
            // Try cc first, fallback to antigravity
            which_cc().map(|_| ResolvedBinary::Cc)
                .or_else(|| which_ag().map(|_| ResolvedBinary::Antigravity))
        }
        _ => None,
    }
}

fn which_cc() -> Option<String> {
    std::process::Command::new("which")
        .arg("cc")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
}

fn which_ag() -> Option<String> {
    std::process::Command::new("which")
        .arg("antigravity")
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                Some(String::from_utf8_lossy(&o.stdout).trim().to_string())
            } else {
                None
            }
        })
}

fn truncate_output(s: &str, max_len: usize) -> String {
    if s.len() <= max_len {
        s.to_string()
    } else {
        format!("{}... (truncated, {} chars total)", &s[..max_len], s.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_prompt_returns_error() {
        let tmp = tempfile::tempdir().unwrap();
        let tool = SubAgentTool;
        let ctx = ToolContext {
            workspace_path: tmp.path().to_path_buf(),
            session_id: "test".to_string(),
            call_id: "c1".to_string(),
            cancel_flag: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
            provider_config: crate::provider::config_for_model("dummy", "dummy"),
        };

        let result = tool.execute(serde_json::json!({"prompt": ""}), &ctx);
        assert!(matches!(result, ToolResult::Error { .. }));
    }

    #[test]
    fn build_args_for_cc() {
        let (binary, args) = ResolvedBinary::Cc.build_args("fix the bug");
        assert_eq!(binary, "cc");
        assert!(args.contains(&"fix the bug".to_string()));
        assert!(args.contains(&"--output-format".to_string()));
    }

    #[test]
    fn build_args_for_antigravity() {
        let (binary, args) = ResolvedBinary::Antigravity.build_args("add logging");
        assert_eq!(binary, "antigravity");
        assert!(args.contains(&"add logging".to_string()));
    }

    #[test]
    fn truncate_long_output() {
        let long = "a".repeat(5000);
        let truncated = truncate_output(&long, 100);
        assert!(truncated.len() < 200); // ~100 + "... (truncated, 5000 chars total)"
        assert!(truncated.contains("truncated"));
    }
}
