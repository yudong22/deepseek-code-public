pub mod safety;
pub mod tools;

use tauri::ipc::Channel;
use tauri::Manager;

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    Thinking(String),
    Text(String),
    ToolCall { name: String, args: String },
    ToolResult { name: String, result: String },
    Finished,
    Error(String),
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn run_agent_loop(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    messages: Vec<ds_api::raw::Message>,
    workspace_root: String,
    session_id: String,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    // 1. 解析工作区路径为绝对路径
    let workspace_path = if workspace_root.is_empty() || workspace_root == "." {
        // 使用 Tauri app_data_dir 获取绝对路径
        let base = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法获取 app_data_dir: {}", e))?;
        let sandbox = base.join("sandbox_workspace");
        if !sandbox.exists() {
            std::fs::create_dir_all(&sandbox)
                .map_err(|e| format!("无法创建沙箱目录: {}", e))?;
        }
        sandbox
    } else {
        // 用户指定了路径：转为绝对路径
        let p = std::path::PathBuf::from(&workspace_root);
        if p.is_relative() {
            std::env::current_dir()
                .map_err(|e| format!("无法获取当前目录: {}", e))?
                .join(p)
        } else {
            p
        }
    };

    // 确保目录存在
    if !workspace_path.exists() {
        std::fs::create_dir_all(&workspace_path)
            .map_err(|e| format!("无法创建工作区目录: {}", e))?;
    }

    // 2. 提取最新一条用户消息作为提示词
    let last_user_prompt = messages
        .iter()
        .rev()
        .find(|m| matches!(m.role, ds_api::raw::Role::User))
        .and_then(|m| m.content.as_ref())
        .ok_or_else(|| "未找到用户提示词 (user prompt)".to_string())?;

    // 3. 确定并解析 sidecar 路径 (Tauri places sidecars in the same directory as the executable)
    let app_dir = std::env::current_exe()
        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?
        .parent()
        .ok_or_else(|| "无法获取可执行文件父目录".to_string())?
        .to_path_buf();

    let sidecar_filename = if cfg!(target_os = "windows") {
        "opencode-sidecar.exe"
    } else {
        "opencode-sidecar"
    };

    let sidecar_path = app_dir.join(sidecar_filename);

    if !sidecar_path.exists() {
        return Err(format!("未找到 sidecar 可执行文件: {}", sidecar_path.display()));
    }

    // 4. 启动 sidecar 进程
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::process::Command;
    use std::process::Stdio;

    let mut cmd = Command::new(&sidecar_path);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("DEEPSEEK_API_KEY", &api_key)
        .env("OPENCODE_MODEL", &model)
        .env("WORKSPACE_PATH", &workspace_path)
        .env("OPENCODE_SESSION_ID", &session_id);

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 sidecar {}: {}", sidecar_path.display(), e))?;

    // 5. 将用户 Prompt 写入 sidecar stdin，并关闭 stdin
    let mut stdin = child.stdin.take().ok_or("无法打开 sidecar stdin".to_string())?;
    stdin.write_all(last_user_prompt.as_bytes()).await
        .map_err(|e| format!("写入 sidecar stdin 失败: {}", e))?;
    drop(stdin); // 关闭 stdin，sidecar 会读取到 EOF 并开始处理

    // 6. 流式读取 stdout 并转发给前端
    let stdout = child.stdout.take().ok_or("无法获取 sidecar stdout".to_string())?;
    let mut reader = BufReader::new(stdout).lines();

    while let Some(line) = reader.next_line().await.map_err(|e| format!("读取 sidecar 输出失败: {}", e))? {
        if let Ok(event) = serde_json::from_str::<AgentEvent>(&line) {
            let _ = on_event.send(event);
        } else {
            // 如果不是 JSON，输出到本地控制台日志中，不作为事件发送给前端以避免污染思维链和时间线
            if !line.trim().is_empty() {
                println!("[Sidecar Log] {}", line);
            }
        }
    }

    // 7. 等待进程退出并做状态校验
    let status = child.wait().await.map_err(|e| format!("等待 sidecar 退出失败: {}", e))?;
    if !status.success() {
        let mut stderr_content = String::new();
        if let Some(stderr) = child.stderr.take() {
            let mut stderr_reader = BufReader::new(stderr).lines();
            while let Some(line) = stderr_reader.next_line().await.unwrap_or(None) {
                stderr_content.push_str(&line);
                stderr_content.push('\n');
            }
        }
        let err_msg = format!("Sidecar 运行失败并退出，退出码: {:?}\n错误日志:\n{}", status.code(), stderr_content);
        let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
        return Err(err_msg);
    }

    Ok(())
}

#[tauri::command]
async fn select_directory() -> Result<Option<String>, String> {
    let dir = rfd::AsyncFileDialog::new()
        .set_title("选择工作区目录")
        .pick_folder()
        .await;
    Ok(dir.map(|d| d.path().to_string_lossy().into_owned()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, run_agent_loop, select_directory])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

