use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::Manager;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

/// 全局取消标记，供 cancel_agent 和 run_agent_loop 共享
struct AgentCancelled(AtomicBool);

/// 交互式 Q&A 用的 sidecar stdin 句柄（保持开启以接收用户输入）
struct AgentStdin(Mutex<Option<tokio::process::ChildStdin>>);

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    /// 推理块边界
    ThinkingStarted,
    /// 推理文本增量
    Thinking(String),
    /// 推理块结束
    ThinkingEnded,
    /// 文本块边界
    TextStarted,
    /// 回复文本增量
    Text(String),
    /// 文本块结束
    TextEnded,
    /// 工具被调用
    ToolCall { name: String, args: String, call_id: String },
    /// 工具开始执行
    ToolStarted { call_id: String },
    /// 工具执行结束
    ToolEnded { call_id: String },
    /// 工具成功
    ToolSuccess { name: String, result: String, call_id: String },
    /// 工具失败
    ToolFailed { name: String, error: String, call_id: String },
    /// Token 用量
    Usage { tokens_input: i64, tokens_output: i64, tokens_reasoning: i64 },
    /// Step 生命周期
    StepStarted,
    StepEnded,
    /// Agent 完成
    Finished,
    /// 错误（不一定是致命错误）
    Error { message: String },
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 归一化 session ID：opencode 的 ID 格式要求以 "ses" 开头。
/// 旧版 DB 存储的是纯 UUID，需要补 "ses_" 前缀。
fn normalize_session_id(id: &str) -> String {
    if id.starts_with("ses") {
        id.to_string()
    } else {
        format!("ses_{}", id)
    }
}

#[tauri::command]
async fn run_agent_loop(
    app: tauri::AppHandle,
    api_key: String,
    model: String,
    messages: Vec<ds_api::raw::Message>,
    workspace_root: String,
    session_id: String,
    agent_mode: Option<String>,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    // 1. 解析工作区路径为绝对路径
    let workspace_path = resolve_workspace_path(&app, &workspace_root)?;
    // 确保目录存在（用户指定路径时 resolve_workspace_path 不自动创建）
    if !workspace_path.exists() {
        std::fs::create_dir_all(&workspace_path)
            .map_err(|e| format!("无法创建工作区目录: {}", e))?;
    }

    // 2. 序列化完整消息 + agent_mode 为 JSON 传给 sidecar stdin
    let input_payload = serde_json::json!({
        "messages": messages,
        "agentMode": agent_mode,
    });
    let input_str = serde_json::to_string(&input_payload)
        .map_err(|e| format!("序列化 sidecar 输入失败: {}", e))?;

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
        .env("OPENCODE_SESSION_ID", &normalize_session_id(&session_id));

    if let Some(ref mode) = agent_mode {
        cmd.env("OPENCODE_AGENT_MODE", mode);
    }

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 sidecar {}: {}", sidecar_path.display(), e))?;

    // 注册取消标记，供 cancel_agent 使用
    app.manage(AgentCancelled(AtomicBool::new(false)));

    // 5. 将结构化 JSON 写入 sidecar stdin，保持开启以支持交互式 Q&A
    let stdin_handle = child.stdin.take().ok_or("无法打开 sidecar stdin".to_string())?;
    // 先写入 stdin 再存储句柄（保持开启，不 drop）
    let mut write_guard = stdin_handle;
    write_guard.write_all(input_str.as_bytes()).await
        .map_err(|e| format!("写入 sidecar stdin 失败: {}", e))?;
    write_guard.write_all(b"\n").await
        .map_err(|e| format!("写入 stdin 换行符失败: {}", e))?;
    // 存储 stdin 句柄到全局状态，保持开启
    app.manage(AgentStdin(Mutex::new(Some(write_guard))));

    // 6. 流式读取 stdout 并转发给前端（支持取消）
    let stdout = child.stdout.take().ok_or("无法获取 sidecar stdout".to_string())?;
    let mut reader = BufReader::new(stdout).lines();

    loop {
        // 检查取消标记
        if app.state::<AgentCancelled>().0.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            let _ = on_event.send(AgentEvent::Finished);
            return Ok(());
        }

        match tokio::time::timeout(Duration::from_secs(1), reader.next_line()).await {
            Ok(Ok(Some(line))) => {
                if let Ok(event) = serde_json::from_str::<AgentEvent>(&line) {
                    let _ = on_event.send(event);
                } else if !line.trim().is_empty() {
                    println!("[Sidecar Log] {}", line);
                }
            }
            Ok(Ok(None)) => break, // EOF
            Ok(Err(e)) => return Err(format!("读取 sidecar 输出失败: {}", e)),
            Err(_) => continue, // 超时，重新检查取消标记
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
        let _ = on_event.send(AgentEvent::Error { message: err_msg.clone() });
        return Err(err_msg);
    }

    // 7b. 清理 stdin 句柄
    if let Some(agent_stdin) = app.try_state::<AgentStdin>() {
        let mut guard = agent_stdin.0.lock().await;
        drop(guard.take());
    }

    Ok(())
}

/// 向运行中的 sidecar 发送用户输入（回答 question 工具的问题）
#[tauri::command]
async fn respond_to_agent(app: tauri::AppHandle, answer: String) -> Result<(), String> {
    let agent_stdin = app.state::<AgentStdin>();
    let mut guard = agent_stdin.0.lock().await;
    if let Some(stdin) = guard.as_mut() {
        stdin.write_all(answer.as_bytes()).await
            .map_err(|e| format!("写入用户输入到 sidecar 失败: {}", e))?;
        stdin.write_all(b"\n").await
            .map_err(|e| format!("写入换行到 sidecar 失败: {}", e))?;
        Ok(())
    } else {
        Err("Agent 未在运行或 stdin 已关闭".to_string())
    }
}

#[tauri::command]
async fn cancel_agent(app: tauri::AppHandle) -> Result<(), String> {
    app.state::<AgentCancelled>().0.store(true, Ordering::SeqCst);
    // 同时关闭 stdin
    if let Some(agent_stdin) = app.try_state::<AgentStdin>() {
        let mut guard = agent_stdin.0.lock().await;
        drop(guard.take());
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

/// 解析工作区根目录为绝对路径（与 run_agent_loop 逻辑一致）
fn resolve_workspace_path(app: &tauri::AppHandle, workspace_root: &str) -> Result<std::path::PathBuf, String> {
    if workspace_root.is_empty() || workspace_root == "." {
        let base = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("无法获取 app_data_dir: {}", e))?;
        let sandbox = base.join("sandbox_workspace");
        if !sandbox.exists() {
            std::fs::create_dir_all(&sandbox)
                .map_err(|e| format!("无法创建沙箱目录: {}", e))?;
        }
        Ok(sandbox)
    } else {
        let p = std::path::PathBuf::from(workspace_root);
        let resolved = if p.is_relative() {
            std::env::current_dir()
                .map_err(|e| format!("无法获取当前目录: {}", e))?
                .join(p)
        } else {
            p
        };
        Ok(resolved)
    }
}

/// 列出工作区中的所有文件（递归，返回相对路径，遵从 .gitignore）
#[tauri::command]
async fn list_workspace_files(
    app: tauri::AppHandle,
    workspace_root: String,
    max_results: Option<usize>,
) -> Result<Vec<String>, String> {
    let workspace_path = resolve_workspace_path(&app, &workspace_root)?;
    let max = max_results.unwrap_or(200);

    let mut results: Vec<String> = Vec::new();
    let walker = ignore::WalkBuilder::new(&workspace_path)
        .standard_filters(true)  // 遵从 .gitignore + 排除隐藏文件/目录（含 .git）
        .follow_links(false)
        .build();

    for entry in walker {
        match entry {
            Ok(e) => {
                if e.file_type().map_or(false, |ft| ft.is_file()) {
                    let rel = e.path().strip_prefix(&workspace_path).unwrap_or(e.path());
                    results.push(rel.to_string_lossy().to_string());
                    if results.len() >= max {
                        break;
                    }
                }
            }
            Err(_) => continue,
        }
    }

    results.sort();
    Ok(results)
}

/// 读取工作区文件的 base64 编码（用于图片等二进制文件预览）
#[tauri::command]
async fn read_file_base64(
    app: tauri::AppHandle,
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    let workspace_path = resolve_workspace_path(&app, &workspace_root)?;
    let file_path = workspace_path.join(&relative_path);

    let canonical_workspace = workspace_path
        .canonicalize()
        .map_err(|e| format!("无法解析工作区路径: {}", e))?;
    let canonical_file = file_path
        .canonicalize()
        .map_err(|e| format!("无法解析文件路径 '{}': {}", relative_path, e))?;

    if !canonical_file.starts_with(&canonical_workspace) {
        return Err("路径穿越检测：文件不在工作区范围内".to_string());
    }

    use std::io::Read;
    let mut file = std::fs::File::open(&canonical_file)
        .map_err(|e| format!("打开文件失败: {}", e))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| format!("读取文件失败: {}", e))?;

    // 使用 base64 标准库编码（不需要额外依赖，直接用 data_encoding 或手动）
    Ok(base64_encode(&buf))
}

/// 简单的 base64 编码（避免引入额外 crate）
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// 解析工作区中文件的绝对路径（用于 convertFileSrc）
#[tauri::command]
async fn resolve_file_path(
    app: tauri::AppHandle,
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    let workspace_path = resolve_workspace_path(&app, &workspace_root)?;
    let file_path = workspace_path.join(&relative_path);

    let canonical_workspace = workspace_path
        .canonicalize()
        .map_err(|e| format!("无法解析工作区路径: {}", e))?;
    let canonical_file = file_path
        .canonicalize()
        .map_err(|e| format!("无法解析文件路径 '{}': {}", relative_path, e))?;

    if !canonical_file.starts_with(&canonical_workspace) {
        return Err("路径穿越检测：文件不在工作区范围内".to_string());
    }

    Ok(canonical_file.to_string_lossy().to_string())
}

/// 读取工作区中指定文件的文本内容
#[tauri::command]
async fn read_text_file(
    app: tauri::AppHandle,
    workspace_root: String,
    relative_path: String,
) -> Result<String, String> {
    let workspace_path = resolve_workspace_path(&app, &workspace_root)?;

    let file_path = workspace_path.join(&relative_path);

    // 路径穿越防护
    let canonical_workspace = workspace_path
        .canonicalize()
        .map_err(|e| format!("无法解析工作区路径: {}", e))?;
    let canonical_file = file_path
        .canonicalize()
        .map_err(|e| format!("无法解析文件路径 '{}': {}", relative_path, e))?;

    if !canonical_file.starts_with(&canonical_workspace) {
        return Err("路径穿越检测：文件不在工作区范围内".to_string());
    }

    std::fs::read_to_string(&canonical_file)
        .map_err(|e| format!("读取文件失败: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            run_agent_loop,
            select_directory,
            cancel_agent,
            respond_to_agent,
            list_workspace_files,
            read_text_file,
            resolve_file_path,
            read_file_base64
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

