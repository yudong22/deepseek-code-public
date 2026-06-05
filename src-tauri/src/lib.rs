pub mod safety;
pub mod tools;

use tauri::ipc::Channel;
use crate::tools::AgentTool;
use crate::tools::{FileReadTool, FileWriteTool, FileEditTool, GrepTool, GlobTool, BashTool};

#[derive(Clone, serde::Serialize)]
#[serde(tag = "type", content = "payload")]
pub enum AgentEvent {
    Thinking(String),
    Text(String),
    ToolCall { name: String, args: String },
    ToolResult { name: String, result: String },
    Finished,
    Error(String),
}

#[derive(serde::Deserialize, Debug)]
struct MyChatCompletionChunk {
    pub choices: Vec<ds_api::raw::ChunkChoice>,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn run_agent_loop(
    api_key: String,
    model: String,
    messages: Vec<ds_api::raw::Message>,
    workspace_root: String,
    on_event: Channel<AgentEvent>,
) -> Result<(), String> {
    let workspace_path = if workspace_root.is_empty() || workspace_root == "." {
        let default_sandbox = std::path::PathBuf::from("backend/sandbox_workspace");
        if !default_sandbox.exists() {
            let _ = std::fs::create_dir_all(&default_sandbox);
        }
        default_sandbox
    } else {
        std::path::PathBuf::from(&workspace_root)
    };
    
    // 初始化 6 个基础工具
    let tools_list: Vec<Box<dyn AgentTool>> = vec![
        Box::new(FileReadTool { workspace_root: workspace_path.clone() }),
        Box::new(FileWriteTool { workspace_root: workspace_path.clone() }),
        Box::new(FileEditTool { workspace_root: workspace_path.clone() }),
        Box::new(GrepTool { workspace_root: workspace_path.clone() }),
        Box::new(GlobTool { workspace_root: workspace_path.clone() }),
        Box::new(BashTool { workspace_root: workspace_path.clone() }),
    ];

    if api_key.trim().is_empty() {
        let err_msg = "API Key 不能为空。请在客户端 Settings 面板中配置并保存您的 DeepSeek API Key。".to_string();
        let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
        return Err(err_msg);
    }

    let client = reqwest::Client::new();
    let mut current_history = messages;
    let max_steps = 15; // 限制最多 15 次多轮交互

    for _step in 0..max_steps {
        // 1. 根据前端传来的模型名称，映射为 DeepSeek 模型类型
        let model_type = if model.contains("reasoner") || model.contains("pro") {
            ds_api::raw::Model::DeepseekReasoner
        } else {
            ds_api::raw::Model::DeepseekChat
        };

        // 2. 注册工具 schema
        let mut tools = Vec::new();
        for t in &tools_list {
            let api_tool = ds_api::raw::Tool {
                r#type: ds_api::raw::ToolType::Function,
                function: ds_api::raw::Function {
                    name: t.name().to_string(),
                    description: Some(t.description().to_string()),
                    parameters: t.parameters(),
                    strict: Some(true),
                }
            };
            tools.push(api_tool);
        }

        let request_payload = ds_api::raw::ChatCompletionRequest {
            messages: current_history.clone(),
            model: model_type,
            stream: Some(true),
            tools: if tools.is_empty() { None } else { Some(tools) },
            ..Default::default()
        };

        // 3. 发送流式 API 请求
        let response = match client
            .post("https://api.deepseek.com/chat/completions")
            .bearer_auth(&api_key)
            .json(&request_payload)
            .send()
            .await
        {
            Ok(res) => res,
            Err(e) => {
                let err_msg = format!("LLM API 请求错误：{}", e);
                let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
                return Err(err_msg);
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_default();
            let err_msg = format!("HTTP 错误 {}: {}", status, error_text);
            let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
            return Err(err_msg);
        }

        use eventsource_stream::Eventsource;
        use futures::StreamExt;

        let event_stream = response.bytes_stream().eventsource();
        let mut stream = Box::pin(event_stream);

        let mut thinking_accumulated = String::new();
        let mut text_accumulated = String::new();
        
        struct AccumulatedToolCall {
            id: String,
            name: String,
            arguments: String,
        }
        let mut accumulated_tool_calls: std::collections::BTreeMap<u32, AccumulatedToolCall> = std::collections::BTreeMap::new();

        // 4. 消费流式响应
        while let Some(event_result) = stream.next().await {
            let event = match event_result {
                Ok(e) => e,
                Err(e) => {
                    let err_msg = format!("流式响应读取失败：{}", e);
                    let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
                    return Err(err_msg);
                }
            };

            if event.data == "[DONE]" {
                break;
            }

            let chunk: MyChatCompletionChunk = match serde_json::from_str(&event.data) {
                Ok(c) => c,
                Err(e) => {
                    let err_msg = format!("流式响应 JSON 解析失败：{}", e);
                    let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
                    return Err(err_msg);
                }
            };

            if chunk.choices.is_empty() {
                continue;
            }

            let delta = &chunk.choices[0].delta;

            // 处理推理思维链（Thinking）
            if let Some(ref thinking) = delta.reasoning_content {
                if !thinking.is_empty() {
                    thinking_accumulated.push_str(thinking);
                    let _ = on_event.send(AgentEvent::Thinking(thinking.clone()));
                }
            }

            // 处理普通回复文本（Text）
            if let Some(ref content) = delta.content {
                if !content.is_empty() {
                    text_accumulated.push_str(content);
                    let _ = on_event.send(AgentEvent::Text(content.clone()));
                }
            }

            // 增量组装流式工具调用（Tool Calls）
            if let Some(ref tool_calls) = delta.tool_calls {
                for tc in tool_calls {
                    let entry = accumulated_tool_calls.entry(tc.index).or_insert_with(|| AccumulatedToolCall {
                        id: String::new(),
                        name: String::new(),
                        arguments: String::new(),
                    });

                    if let Some(ref id) = tc.id {
                        entry.id.push_str(id);
                    }
                    if let Some(ref func) = tc.function {
                        if let Some(ref name) = func.name {
                            entry.name.push_str(name);
                        }
                        if let Some(ref args) = func.arguments {
                            entry.arguments.push_str(args);
                        }
                    }
                }
            }
        }

        // 5. 将回复添加到历史会话消息中
        let assistant_msg = ds_api::raw::Message {
            role: ds_api::raw::Role::Assistant,
            content: if text_accumulated.is_empty() { None } else { Some(text_accumulated.clone()) },
            reasoning_content: if thinking_accumulated.is_empty() { None } else { Some(thinking_accumulated.clone()) },
            tool_calls: if accumulated_tool_calls.is_empty() {
                None
            } else {
                Some(accumulated_tool_calls.values().map(|tc| ds_api::raw::ToolCall {
                    id: tc.id.clone(),
                    r#type: ds_api::raw::ToolType::Function,
                    function: ds_api::raw::FunctionCall {
                        name: tc.name.clone(),
                        arguments: tc.arguments.clone(),
                    }
                }).collect())
            },
            ..Default::default()
        };
        current_history.push(assistant_msg);

        // 如果模型没有触发任何 Tool 调用，说明回答已完结，直接返回
        if accumulated_tool_calls.is_empty() {
            let _ = on_event.send(AgentEvent::Finished);
            return Ok(());
        }

        // 6. 执行触发的所有工具
        for tc in accumulated_tool_calls.values() {
            // 发送 Tool 调用通知
            let _ = on_event.send(AgentEvent::ToolCall {
                name: tc.name.clone(),
                args: tc.arguments.clone(),
            });

            // 检索匹配对应工具
            let tool = tools_list.iter().find(|t| t.name() == tc.name);
            let result_val = if let Some(t) = tool {
                let args_json: serde_json::Value = match serde_json::from_str(&tc.arguments) {
                    Ok(val) => val,
                    Err(e) => serde_json::json!({ "error": format!("参数 JSON 解析错误: {}", e) }),
                };
                t.call(args_json).await
            } else {
                serde_json::json!({ "error": format!("未找到该工具: {}", tc.name) })
            };

            let result_str = result_val.to_string();

            // 发送 Tool 结果通知
            let _ = on_event.send(AgentEvent::ToolResult {
                name: tc.name.clone(),
                result: result_str.clone(),
            });

            // 将工具运行结果加入消息历史
            let tool_msg = ds_api::raw::Message {
                role: ds_api::raw::Role::Tool,
                tool_call_id: Some(tc.id.clone()),
                content: Some(result_str),
                ..Default::default()
            };
            current_history.push(tool_msg);
        }
    }

    let _ = on_event.send(AgentEvent::Finished);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![greet, run_agent_loop])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

