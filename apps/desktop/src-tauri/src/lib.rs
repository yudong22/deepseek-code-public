use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::ipc::Channel;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::mpsc;

// ─── Agent State (v0.5.0: replaces subprocess with in-process agent) ───

/// Shared state between `run_agent_loop`, `cancel_agent`, and `respond_to_agent`.
struct AgentState {
    /// Cancellation flag checked by the agent loop
    cancel_flag: Arc<AtomicBool>,
    /// Channel sender for user answers to the question tool (never dropped)
    answer_tx: mpsc::UnboundedSender<String>,
    /// Watch sender for cancellation — sends to unblock question handler
    cancel_tx: tokio::sync::watch::Sender<bool>,
}

/// v0.5.8: API key state shared between commands and scheduler
struct ApiKeyState {
    key: std::sync::Mutex<String>,
}

// ─── AgentEvent Enum (Tauri-facing, unchanged from v0.4.x) ───

#[derive(Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    ThinkingStarted,
    Thinking(String),
    ThinkingEnded,
    TextStarted,
    Text(String),
    TextEnded,
    ToolCall { name: String, args: String, call_id: String },
    ToolStarted { call_id: String },
    ToolEnded { call_id: String },
    ToolSuccess { name: String, result: String, call_id: String },
    ToolFailed { name: String, error: String, call_id: String },
    Usage { tokens_input: i64, tokens_output: i64, tokens_reasoning: i64 },
    StepStarted,
    StepEnded,
    Finished,
    Error { message: String },
}

// ─── Conversion: sidecar-agent protocol -> Tauri AgentEvent ───

impl From<sidecar_agent::protocol::AgentEvent> for AgentEvent {
    fn from(evt: sidecar_agent::protocol::AgentEvent) -> Self {
        match evt {
            sidecar_agent::protocol::AgentEvent::ThinkingStarted => AgentEvent::ThinkingStarted,
            sidecar_agent::protocol::AgentEvent::Thinking(s) => AgentEvent::Thinking(s),
            sidecar_agent::protocol::AgentEvent::ThinkingEnded => AgentEvent::ThinkingEnded,
            sidecar_agent::protocol::AgentEvent::TextStarted => AgentEvent::TextStarted,
            sidecar_agent::protocol::AgentEvent::Text(s) => AgentEvent::Text(s),
            sidecar_agent::protocol::AgentEvent::TextEnded => AgentEvent::TextEnded,
            sidecar_agent::protocol::AgentEvent::ToolCall { name, args, call_id } => {
                AgentEvent::ToolCall { name, args, call_id }
            }
            sidecar_agent::protocol::AgentEvent::ToolStarted { call_id } => {
                AgentEvent::ToolStarted { call_id }
            }
            sidecar_agent::protocol::AgentEvent::ToolSuccess { name, result, call_id } => {
                AgentEvent::ToolSuccess { name, result, call_id }
            }
            sidecar_agent::protocol::AgentEvent::ToolFailed { name, error, call_id } => {
                AgentEvent::ToolFailed { name, error, call_id }
            }
            sidecar_agent::protocol::AgentEvent::ToolEnded { call_id } => {
                AgentEvent::ToolEnded { call_id }
            }
            sidecar_agent::protocol::AgentEvent::StepStarted => AgentEvent::StepStarted,
            sidecar_agent::protocol::AgentEvent::StepEnded => AgentEvent::StepEnded,
            sidecar_agent::protocol::AgentEvent::Finished => AgentEvent::Finished,
            sidecar_agent::protocol::AgentEvent::Error { message } => AgentEvent::Error { message },
            sidecar_agent::protocol::AgentEvent::Usage { tokens_input, tokens_output, tokens_reasoning } => {
                AgentEvent::Usage {
                    tokens_input,
                    tokens_output,
                    tokens_reasoning: tokens_reasoning.unwrap_or(0),
                }
            }
        }
    }
}

// ─── Tauri Commands ──────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Normalize session ID: opencode requires IDs to start with "ses".
fn normalize_session_id(id: &str) -> String {
    if id.starts_with("ses") {
        id.to_string()
    } else {
        format!("ses_{}", id)
    }
}

/// Run the agent loop (v0.5.0: in-process Rust agent, no subprocess).
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
    // 1. Resolve workspace path
    let workspace_path = resolve_workspace_path(&app, &workspace_root)?;
    if !workspace_path.exists() {
        std::fs::create_dir_all(&workspace_path)
            .map_err(|e| format!("无法创建工作区目录: {}", e))?;
    }

    // 2. Extract prompt and system messages from frontend messages
    let system_messages: Vec<sidecar_agent::protocol::StdinMessage> = messages
        .iter()
        .filter(|m| matches!(m.role, ds_api::raw::Role::System))
        .map(|m| sidecar_agent::protocol::StdinMessage {
            role: "system".to_string(),
            content: m.content.clone(),
        })
        .collect();

    let prompt = messages
        .iter()
        .rev()
        .find(|m| matches!(m.role, ds_api::raw::Role::User))
        .and_then(|m| m.content.clone())
        .unwrap_or_default();

    if prompt.is_empty() {
        return Err("No user message found".to_string());
    }

    // 3. Create communication channels
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<sidecar_agent::protocol::AgentEvent>();
    let (answer_tx, answer_rx) = mpsc::unbounded_channel::<String>();
    let cancel_flag = Arc::new(AtomicBool::new(false));
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

    // 4. Register shared state for cancel_agent / respond_to_agent
    app.manage(AgentState {
        cancel_flag: cancel_flag.clone(),
        answer_tx,
        cancel_tx,
    });

    // 5. Build agent configuration
    let effective_session_id = if agent_mode.as_deref() == Some("plan") {
        sidecar_agent::protocol::derive_plan_session_id(Some(&session_id))
            .unwrap_or_else(|| normalize_session_id(&session_id))
    } else {
        normalize_session_id(&session_id)
    };

    let config = sidecar_agent::agent::AgentConfig {
        api_key,
        model,
        workspace_path,
        session_id: effective_session_id,
        agent_mode,
        system_messages,
    };

    let tools = sidecar_agent::tools::default_registry();

    // 6. Spawn agent in a tokio task
    let agent_handle = tokio::spawn(async move {
        let mut agent = sidecar_agent::agent::Agent::new(
            config,
            event_tx,
            answer_rx,
            cancel_flag,
            cancel_rx,
            tools,
        );
        agent.run(&prompt).await
    });

    // 7. Forward events to the frontend via Tauri Channel
    while let Some(evt) = event_rx.recv().await {
        let _ = on_event.send(evt.into());
    }

    // 8. Wait for agent to complete
    match agent_handle.await {
        Ok(Ok(())) => Ok(()),
        Ok(Err(e)) => Err(format!("Agent 运行失败: {}", e)),
        Err(e) => Err(format!("Agent task 异常: {}", e)),
    }
}

/// Send user input to the running agent (answer a question tool prompt).
#[tauri::command]
async fn respond_to_agent(app: tauri::AppHandle, answer: String) -> Result<(), String> {
    let state = app.state::<AgentState>();
    state
        .answer_tx
        .send(answer)
        .map_err(|e| format!("发送用户输入到 agent 失败: {}", e))
}

/// Cancel the running agent.
#[tauri::command]
async fn cancel_agent(app: tauri::AppHandle) -> Result<(), String> {
    let state = app.state::<AgentState>();

    // Set cancellation flag — agent loop checks this on each iteration
    state.cancel_flag.store(true, Ordering::SeqCst);

    // Signal cancellation to unblock any pending question handler
    let _ = state.cancel_tx.send(true);

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

// ─── Workspace Helpers ───────────────────────────

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
        .standard_filters(true)
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

#[tauri::command]
async fn read_text_file(
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

    std::fs::read_to_string(&canonical_file)
        .map_err(|e| format!("读取文件失败: {}", e))
}

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

    Ok(base64_encode(&buf))
}

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

// ─── Scheduled Task Commands (v0.5.8) ─────────────

/// Helper: resolve .opencode directory from AppHandle
fn opencode_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取 app data dir: {}", e))?;
    Ok(app_dir.join(".opencode"))
}

#[tauri::command]
fn list_scheduled_tasks(app: tauri::AppHandle) -> Result<Vec<sidecar_agent::session::ScheduledTask>, String> {
    ensure_scheduler_started(app.clone());
    let dir = opencode_dir(&app)?;
    let store = sidecar_agent::session::SessionStore::new(dir, "scheduler");
    store.list_scheduled_tasks().map_err(|e| e.to_string())
}

#[tauri::command]
fn create_scheduled_task(app: tauri::AppHandle, task: sidecar_agent::session::ScheduledTask) -> Result<(), String> {
    let dir = opencode_dir(&app)?;
    let store = sidecar_agent::session::SessionStore::new(dir, "scheduler");
    store.init_tables().map_err(|e| e.to_string())?;
    store.create_scheduled_task(&task).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_scheduled_task(app: tauri::AppHandle, task: sidecar_agent::session::ScheduledTask) -> Result<(), String> {
    let dir = opencode_dir(&app)?;
    let store = sidecar_agent::session::SessionStore::new(dir, "scheduler");
    store.update_scheduled_task(&task).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_scheduled_task(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let dir = opencode_dir(&app)?;
    let store = sidecar_agent::session::SessionStore::new(dir, "scheduler");
    store.delete_scheduled_task(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn toggle_scheduled_task(app: tauri::AppHandle, id: String, enabled: bool) -> Result<(), String> {
    let dir = opencode_dir(&app)?;
    let store = sidecar_agent::session::SessionStore::new(dir, "scheduler");
    store.toggle_scheduled_task(&id, enabled).map_err(|e| e.to_string())
}

// ─── Scheduler (v0.5.8) ───────────────────────────

/// Lazily start the scheduler on first access (avoids setup-stage panics).
fn ensure_scheduler_started(app: tauri::AppHandle) {
    use std::sync::OnceLock;
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        tauri::async_runtime::spawn(async move {
            // Delay first tick to let Tauri fully initialize
            tokio::time::sleep(std::time::Duration::from_secs(10)).await;
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
            loop {
                interval.tick().await;
                let dir = match opencode_dir(&app) {
                    Ok(d) => d,
                    Err(e) => { eprintln!("[scheduler] opencode_dir error: {e}"); continue; }
                };
                let store = sidecar_agent::session::SessionStore::new(dir, "scheduler");
                let _ = store.init_tables();
                let tasks = match store.get_due_tasks() {
                    Ok(t) => t,
                    Err(e) => { eprintln!("[scheduler] get_due_tasks error: {e}"); continue; }
                };
            for task in tasks {
                if !task.enabled {
                    continue;
                }
                let task_id = task.id.clone();
                let task_prompt = task.prompt.clone();
                let _ = store.complete_scheduled_task(&task_id, "running");

                // Build agent config
                let workspace_path = std::path::PathBuf::from(&task.workspace_root);
                if !workspace_path.exists() {
                    let _ = store.complete_scheduled_task(&task_id, "failed: workspace not found");
                    continue;
                }

                // Read API key from managed state
                let api_guard = app.state::<ApiKeyState>();
                let api_key = api_guard.key.lock().unwrap_or_else(|e| e.into_inner()).clone();
                if api_key.is_empty() {
                    let _ = store.complete_scheduled_task(&task_id, "failed: no API key");
                    continue;
                }

                let config = sidecar_agent::agent::AgentConfig {
                    api_key,
                    model: "deepseek-chat".to_string(),
                    workspace_path,
                    session_id: format!("sched_{}", task_id),
                    agent_mode: None,
                    system_messages: vec![],
                };

                let tools = sidecar_agent::tools::default_registry();
                let (event_tx, mut event_rx) =
                    tokio::sync::mpsc::unbounded_channel::<sidecar_agent::protocol::AgentEvent>();
                let (_answer_tx, answer_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
                let cancel_flag = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
                let (_cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

                let app_clone = app.clone();
                let tid = task_id.clone();

                tauri::async_runtime::spawn(async move {
                    let mut agent = sidecar_agent::agent::Agent::new(
                        config,
                        event_tx,
                        answer_rx,
                        cancel_flag,
                        cancel_rx,
                        tools,
                    );
                    agent.run(&task_prompt).await
                });

                // Forward events to frontend via Tauri emit
                while let Some(evt) = event_rx.recv().await {
                    let payload = serde_json::to_value(&evt).unwrap_or_default();
                    let _ = app_clone.emit("scheduled-task-event", serde_json::json!({
                        "taskId": tid,
                        "event": payload,
                    }));
                }

                let status = "completed";
                let _ = store.complete_scheduled_task(&task_id, status);
            }
            } // end loop
        });
    });
}

// ─── App Entry Point ─────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(ApiKeyState { key: std::sync::Mutex::new(String::new()) })
        .invoke_handler(tauri::generate_handler![
            greet,
            run_agent_loop,
            select_directory,
            cancel_agent,
            respond_to_agent,
            list_workspace_files,
            read_text_file,
            resolve_file_path,
            read_file_base64,
            list_scheduled_tasks,
            create_scheduled_task,
            update_scheduled_task,
            delete_scheduled_task,
            toggle_scheduled_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
