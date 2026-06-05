use serde::Deserialize;
use serde_json::{json, Value};
use std::path::{PathBuf};
use tokio::process::Command;
use super::AgentTool;

pub struct BashTool {
    pub workspace_root: PathBuf,
}

#[derive(Deserialize)]
struct BashArgs {
    command: String,
}

impl AgentTool for BashTool {
    fn name(&self) -> &'static str {
        "Bash"
    }

    fn description(&self) -> &'static str {
        "在本地系统 Shell 中执行命令行指令。用于执行编译构建、运行单元测试或进行 Git 版本控制。\n\
         注意事项：\n\
         - 严禁通过此工具调用 `cat`, `echo >`, `sed`, `grep`, `rg` 来读写编辑文件或搜索代码。对于这些任务，必须使用专门的 `FileRead`、`FileEdit`、`FileWrite` 和 `Grep` 工具。\n\
         - 指令将默认在项目的工作区根目录下执行（Cwd）。在 macOS/Linux 上调用 `/bin/sh -c`，在 Windows 上自适应调用 `powershell.exe`。"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "需要执行的完整命令行字符串"
                }
            },
            "required": ["command"]
        })
    }

    fn call<'a>(&'a self, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Value> + Send + 'a>> {
        Box::pin(async move {
            let args: BashArgs = match serde_json::from_value(args) {
                Ok(a) => a,
                Err(e) => return json!({ "error": format!("参数解析错误：{}", e) }),
            };

            let is_windows = cfg!(target_os = "windows");
            
            let mut cmd = if is_windows {
                let mut c = Command::new("powershell.exe");
                c.arg("-Command").arg(&args.command);
                c
            } else {
                let mut c = Command::new("/bin/sh");
                c.arg("-c").arg(&args.command);
                c
            };

            // 强制将工作目录限制在工作区根路径下
            cmd.current_dir(&self.workspace_root);

            // 捕获 stdout 和 stderr，带 30 秒超时保护
            let timeout_duration = std::time::Duration::from_secs(30);
            match tokio::time::timeout(timeout_duration, cmd.output()).await {
                Ok(Ok(output)) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let exit_code = output.status.code();

                    json!({
                        "stdout": stdout,
                        "stderr": stderr,
                        "exit_code": exit_code,
                        "success": output.status.success()
                    })
                }
                Ok(Err(e)) => {
                    json!({
                        "error": format!("命令行进程启动或执行失败：{}", e)
                    })
                }
                Err(_) => {
                    json!({
                        "error": "Command timed out after 30 seconds"
                    })
                }
            }
        })
    }
}
