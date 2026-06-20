# deepseek-code 修改记录 (Modification Record)

本文档详细记录了针对 `deepseek-code` 项目所做的所有修改。核心改动在于**将 Agent 执行循环从 Tauri Rust 后端解耦，迁移至外部 Sidecar 进程 (`opencode-sidecar`) 运行**。

---

## 1. 架构调整与原理解析

### 变更背景与架构对比
- **修改前**：
  Agent 的核心执行循环（即网络调用、SSE 流解析、6个本地工具初始化与执行等）全部在 Tauri 后端的 Rust 进程 ([src-tauri/src/lib.rs](file:///Users/denis/Sites/deepseek-code-public/src-tauri/src/lib.rs)) 中以同步阻塞/多线程方式运行。这种设计导致后端逻辑过于复杂，且不易于跨平台独立调试与功能扩展。
- **修改后**：
  将 Agent 执行逻辑剥离到外部独立的 sidecar 进程 `opencode-sidecar` 中。Tauri 后端退化为一个轻量级的管理和通信中转层：
  1. **构建阶段**：通过 `package.json` 中的新脚本 `build:sidecar`，自动编译 `src-sidecar/index.ts` 并在 Rust 的 sidecar 目录 `src-tauri/binaries/` 下为当前架构生成对应命名的二进制可执行文件。
  2. **执行阶段**：
     - Tauri 后端提取前端发来的最后一条 User 消息作为 Prompt，并通过管道（stdin）写入启动的 sidecar 进程。
     - sidecar 进程在独立环境中执行 Agent 决策与工具调用，并将中间过程的状态（`Thinking`、`Text`、`ToolCall`、`ToolResult` 等）格式化为 JSON 字符串流，输出到标准输出（stdout）。
     - Tauri 后端流式读取 stdout，如果是标准的 JSON 格式则反序列化为 `AgentEvent` 并通过 Tauri Channel 投递给前端；如果是非 JSON，则作为普通思考流 `Thinking` 转发。
     - sidecar 退出后，后端做退出状态校验。若非正常退出，则读取 stderr 的错误日志并通过 `AgentEvent::Error` 通知前端。

---

## 2. 修改文件清单及概要

我们对以下文件进行了修改：

### `deepseek-code-public` 仓库

1. **[package.json](file:///Users/denis/Sites/deepseek-code-public/package.json)**
   - 新增了 `build:sidecar` 脚本，用于在编译或运行时编译 sidecar 二进制文件。
   - 修改了 `dev`、`build`、`preview`、`build:mac` 脚本，确保在启动或构建时均会前置运行 `build:sidecar`。

2. **[src-sidecar/index.ts](file:///Users/denis/Sites/deepseek-code-public/src-sidecar/index.ts)** [NEW]
   - 实现了 sidecar 二进制的逻辑：读取 stdin 作为 prompt，初始化 `opencode` 的 `Session`，监听 `session.prompt` 事件并格式化为 `AgentEvent` JSON 流写入 stdout。
   - 修复了读取 `rawEvent` 属性时未通过 `.data` 访问的 Bug（详见第 4 节）。

3. **[src-tauri/src/lib.rs](file:///Users/denis/Sites/deepseek-code-public/src-tauri/src/lib.rs)**
   - 给 `AgentEvent` 增加了 `serde::Deserialize` 派生宏，方便反序列化 sidecar 输出的事件。
   - 移除了原本定义在 `lib.rs` 中用于内部 LLM 流式解析的 `MyChatCompletionChunk` 等结构体。
   - 重构了 `run_agent_loop` 接口，新增 `session_id` 参数。
   - 替换了原有的 LLM 请求及工具执行循环，改为利用 `tokio::process::Command` 启动 `opencode-sidecar` 进程，并通过 stdin/stdout 传输数据。

4. **[src-tauri/tauri.conf.json](file:///Users/denis/Sites/deepseek-code-public/src-tauri/tauri.conf.json)**
   - 在 `bundle.externalBin` 配置中添加了 `binaries/opencode-sidecar`，声明该外部二进制为应用的 sidecar，使 Tauri 在打包时能正确识别并将其打包进安装包。

5. **[src/App.tsx](file:///Users/denis/Sites/deepseek-code-public/src/App.tsx)**
   - 适配 `runAgent` 接口变更，传入 `currentSessionId!`。
   - 优化了 Agent 执行异常捕获逻辑，在 `showToast` 中对字符串类型与对象类型的错误信息做了更好的兼容处理。

6. **[src/bridge/mock.ts](file:///Users/denis/Sites/deepseek-code-public/src/bridge/mock.ts)**
   - 适配 `IBridge.runAgent` 的接口定义，在 mock 环境的实现中加入了 `_sessionId` 参数。

7. **[src/bridge/tauri.ts](file:///Users/denis/Sites/deepseek-code-public/src/bridge/tauri.ts)**
   - 适配 `IBridge.runAgent` 的接口定义，在 tauri 环境 the 实现中传入 `sessionId` 到 Tauri 命令载荷中。

8. **[src/bridge/types.ts](file:///Users/denis/Sites/deepseek-code-public/src/bridge/types.ts)**
   - 更新了 `IBridge.runAgent` 的 TypeScript 类型签名，新增必填的 `sessionId: string` 参数。

### `opencode` 仓库

9. **[packages/core/src/session/wrapper.ts](file:///Users/denis/Sites/opencode/packages/core/src/session/wrapper.ts)**
   - 修复了核心事件流过滤时使用错误的属性路径导致所有事件被过滤掉的 Bug（详见第 4 节）。

---

## 3. deepseek-code-public 仓库 Git Diff

```diff
diff --git a/package.json b/package.json
index 65623f2..1ee8d46 100644
--- a/package.json
+++ b/package.json
@@ -4,12 +4,13 @@
   "version": "0.1.1",
   "type": "module",
   "scripts": {
-    "dev": "vite",
-    "build": "tsc && vite build",
-    "preview": "tauri dev",
+    "build:sidecar": "mkdir -p src-tauri/binaries && cd ../opencode && bun build --compile ../deepseek-code-public/src-sidecar/index.ts --outfile ../deepseek-code-public/src-tauri/binaries/opencode-sidecar-$(rustc -Vv | grep host | cut -d ' ' -f 2)",
+    "dev": "bun run build:sidecar && vite",
+    "build": "bun run build:sidecar && tsc && vite build",
+    "preview": "bun run build:sidecar && tauri dev",
     "tauri": "tauri",
     "test": "export PATH=\"$PATH:$HOME/.bun/bin\" && cargo check --manifest-path src-tauri/Cargo.toml && bun test",
-    "build:mac": "tauri build && (killall deepseek-code || true) && cp -rf src-tauri/target/release/bundle/macos/deepseek-code.app /Applications/"
+    "build:mac": "bun run build:sidecar && tauri build && (killall deepseek-code || true) && cp -rf src-tauri/target/release/bundle/macos/deepseek-code.app /Applications/"
   },
   "dependencies": {
     "@tauri-apps/api": "^2",
diff --git a/src-tauri/src/lib.rs b/src-tauri/src/lib.rs
index 8bf9fa2..354ecac 100644
--- a/src-tauri/src/lib.rs
+++ b/src-tauri/src/lib.rs
@@ -3,10 +3,8 @@ pub mod tools;
 
 use tauri::ipc::Channel;
 use tauri::Manager;
-use crate::tools::AgentTool;
-use crate::tools::{FileReadTool, FileWriteTool, FileEditTool, GrepTool, GlobTool, BashTool};
 
-#[derive(Clone, serde::Serialize)]
+#[derive(Clone, serde::Serialize, serde::Deserialize)]
 #[serde(tag = "type", content = "payload")]
 pub enum AgentEvent {
     Thinking(String),
@@ -17,11 +15,6 @@ pub enum AgentEvent {
     Error(String),
 }
 
-#[derive(serde::Deserialize, Debug)]
-struct MyChatCompletionChunk {
-    pub choices: Vec<ds_api::raw::ChunkChoice>,
-}
-
 // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
 #[tauri::command]
 fn greet(name: &str) -> String {
@@ -35,9 +28,10 @@ async fn run_agent_loop(
     model: String,
     messages: Vec<ds_api::raw::Message>,
     workspace_root: String,
+    session_id: String,
     on_event: Channel<AgentEvent>,
 ) -> Result<(), String> {
-    // 解析工作区路径为绝对路径
+    // 1. 解析工作区路径为绝对路径
     let workspace_path = if workspace_root.is_empty() || workspace_root == "." {
         // 使用 Tauri app_data_dir 获取绝对路径
         let base = app
@@ -68,309 +62,86 @@ async fn run_agent_loop(
             .map_err(|e| format!("无法创建工作区目录: {}", e))?;
     }
 
-    // 初始化 6 个基础工具
-    let tools_list: Vec<Box<dyn AgentTool>> = vec![
-        Box::new(FileReadTool { workspace_root: workspace_path.clone() }),
-        Box::new(FileWriteTool { workspace_root: workspace_path.clone() }),
-        Box::new(FileEditTool { workspace_root: workspace_path.clone() }),
-        Box::new(GrepTool { workspace_root: workspace_path.clone() }),
-        Box::new(GlobTool { workspace_root: workspace_path.clone() }),
-        Box::new(BashTool { workspace_root: workspace_path.clone() }),
-    ];
-
-    if api_key.trim().is_empty() {
-        let err_msg = "API Key 不能为空。请在客户端 Settings 面板中配置并保存您的 DeepSeek API Key。".to_string();
-        let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
-        return Err(err_msg);
-    }
-
-    let client = reqwest::Client::new();
-    let mut current_history = messages;
-
-    // 动态获取并注入工作区环境元数据（Git 分支、文件列表）到系统提示词中
-    if !current_history.is_empty() {
-        if let ds_api::raw::Role::System = current_history[0].role {
-            let ws_path = std::path::PathBuf::from(&workspace_root);
-        
-        // 1. 获取当前 Git 分支名
-        let git_branch = match std::process::Command::new("git")
-            .args(&["rev-parse", "--abbrev-ref", "HEAD"])
-            .current_dir(&ws_path)
-            .output()
-        {
-            Ok(output) if output.status.success() => {
-                String::from_utf8_lossy(&output.stdout).trim().to_string()
-            }
-            _ => "Not a git repository (or git not found)".to_string(),
-        };
-
-        // 2. 扫描工作区根目录下的前 30 个项目，生成概要大纲
-        let mut file_list = Vec::new();
-        if let Ok(entries) = std::fs::read_dir(&ws_path) {
-            let mut count = 0;
-            for entry in entries {
-                if count >= 30 {
-                    file_list.push("... (more files truncated)".to_string());
-                    break;
-                }
-                if let Ok(entry) = entry {
-                    let file_name = entry.file_name().to_string_lossy().to_string();
-                    // 忽略隐藏的点文件，但保留 .gitignore
-                    if file_name.starts_with('.') && file_name != ".gitignore" {
-                        continue;
-                    }
-                    let file_type = if entry.path().is_dir() { "dir" } else { "file" };
-                    file_list.push(format!("- {} ({})", file_name, file_type));
-                    count += 1;
-                }
-            }
-        }
-
-        let file_outline = if file_list.is_empty() {
-            "Empty directory or read failed".to_string()
-        } else {
-            file_list.join("\n")
-        };
+    // 2. 提取最新一条用户消息作为提示词
+    let last_user_prompt = messages
+        .iter()
+        .rev()
+        .find(|m| matches!(m.role, ds_api::raw::Role::User))
+        .and_then(|m| m.content.as_ref())
+        .ok_or_else(|| "未找到用户提示词 (user prompt)".to_string())?;
+
+    // 3. 确定并解析 sidecar 路径 (Tauri places sidecars in the same directory as the executable)
+    let app_dir = std::env::current_exe()
+        .map_err(|e| format!("无法获取当前可执行文件路径: {}", e))?
+        .parent()
+        .ok_or_else(|| "无法获取可执行文件父目录".to_string())?
+        .to_path_buf();
+
+    let sidecar_filename = if cfg!(target_os = "windows") {
+        "opencode-sidecar.exe"
+    } else {
+        "opencode-sidecar"
+    };
 
-        // 3. 组装扩展环境上下文
-        let workspace_context = format!(
-            "\n\n[Active Workspace Context]\n\
-             Workspace Root Path: {}\n\
-             Current Git Branch: {}\n\
-             Workspace root contents:\n\
-             {}\n\
-             [End Workspace Context]",
-            workspace_root,
-            git_branch,
-            file_outline
-        );
+    let sidecar_path = app_dir.join(sidecar_filename);
 
-        // 4. 追加到系统提示词内容中
-        if let Some(ref mut content) = current_history[0].content {
-            content.push_str(&workspace_context);
-        }
-        }
+    if !sidecar_path.exists() {
+        return Err(format!("未找到 sidecar 可执行文件: {}", sidecar_path.display()));
     }
 
-    let max_steps = 15; // 限制最多 15 次多轮交互
-
-    for _step in 0..max_steps {
-        // 1. 根据前端传来的模型名称，映射为 DeepSeek 模型类型
-        let model_type = if model.contains("reasoner") || model.contains("pro") {
-            ds_api::raw::Model::DeepseekReasoner
-        } else {
-            ds_api::raw::Model::DeepseekChat
-        };
-
-        // 2. 注册工具 schema
-        let mut tools = Vec::new();
-        for t in &tools_list {
-            let api_tool = ds_api::raw::Tool {
-                r#type: ds_api::raw::ToolType::Function,
-                function: ds_api::raw::Function {
-                    name: t.name().to_string(),
-                    description: Some(t.description().to_string()),
-                    parameters: t.parameters(),
-                    strict: Some(true),
-                }
-            };
-            tools.push(api_tool);
-        }
-
-        let request_payload = ds_api::raw::ChatCompletionRequest {
-            messages: current_history.clone(),
-            model: model_type,
-            stream: Some(true),
-            tools: if tools.is_empty() { None } else { Some(tools) },
-            ..Default::default()
-        };
-
-        // 3. 发送流式 API 请求
-        let response = match client
-            .post("https://api.deepseek.com/chat/completions")
-            .bearer_auth(&api_key)
-            .json(&request_payload)
-            .send()
-            .await
-        {
-            Ok(res) => res,
-            Err(e) => {
-                let err_msg = format!("LLM API 请求错误：{}", e);
-                let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
-                return Err(err_msg);
-            }
-        };
-
-        if !response.status().is_success() {
-            let status = response.status();
-            let error_text = response.text().await.unwrap_or_default();
-            let err_msg = format!("HTTP 错误 {}: {}", status, error_text);
-            let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
-            return Err(err_msg);
-        }
-
-        use eventsource_stream::Eventsource;
-        use futures::StreamExt;
-
-        let event_stream = response.bytes_stream().eventsource();
-        let mut stream = Box::pin(event_stream);
-
-        let mut thinking_accumulated = String::new();
-        let mut text_accumulated = String::new();
-        
-        struct AccumulatedToolCall {
-            id: String,
-            name: String,
-            arguments: String,
-        }
-        let mut accumulated_tool_calls: std::collections::BTreeMap<u32, AccumulatedToolCall> = std::collections::BTreeMap::new();
-
-        // 4. 消费流式响应
-        while let Some(event_result) = stream.next().await {
-            let event = match event_result {
-                Ok(e) => e,
-                Err(e) => {
-                    let err_msg = format!("流式响应读取失败：{}", e);
-                    let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
-                    return Err(err_msg);
-                }
-            };
-
-            if event.data == "[DONE]" {
-                break;
-            }
-
-            let chunk: MyChatCompletionChunk = match serde_json::from_str(&event.data) {
-                Ok(c) => c,
-                Err(e) => {
-                    let err_msg = format!("流式响应 JSON 解析失败：{}", e);
-                    let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
-                    return Err(err_msg);
-                }
-            };
-
-            if chunk.choices.is_empty() {
-                continue;
-            }
-
-            let delta = &chunk.choices[0].delta;
-
-            // 处理推理思维链（Thinking）
-            if let Some(ref thinking) = delta.reasoning_content {
-                if !thinking.is_empty() {
-                    thinking_accumulated.push_str(thinking);
-                    let _ = on_event.send(AgentEvent::Thinking(thinking.clone()));
-                }
-            }
-
-            // 处理普通回复文本（Text）
-            if let Some(ref content) = delta.content {
-                if !content.is_empty() {
-                    text_accumulated.push_str(content);
-                    let _ = on_event.send(AgentEvent::Text(content.clone()));
-                }
-            }
-
-            // 增量组装流式工具调用（Tool Calls）
-            if let Some(ref tool_calls) = delta.tool_calls {
-                for tc in tool_calls {
-                    let entry = accumulated_tool_calls.entry(tc.index).or_insert_with(|| AccumulatedToolCall {
-                        id: String::new(),
-                        name: String::new(),
-                        arguments: String::new(),
-                    });
-
-                    if let Some(ref id) = tc.id {
-                        entry.id.push_str(id);
-                    }
-                    if let Some(ref func) = tc.function {
-                        if let Some(ref name) = func.name {
-                            entry.name.push_str(name);
-                        }
-                        if let Some(ref args) = func.arguments {
-                            entry.arguments.push_str(args);
-                        }
-                    }
-                }
-            }
-        }
-
-        // 5. 将回复添加到历史会话消息中
-        let assistant_msg = ds_api::raw::Message {
-            role: ds_api::raw::Role::Assistant,
-            content: if text_accumulated.is_empty() { None } else { Some(text_accumulated.clone()) },
-            reasoning_content: if thinking_accumulated.is_empty() { None } else { Some(thinking_accumulated.clone()) },
-            tool_calls: if accumulated_tool_calls.is_empty() {
-                None
-            } else {
-                Some(accumulated_tool_calls.values().map(|tc| ds_api::raw::ToolCall {
-                    id: tc.id.clone(),
-                    r#type: ds_api::raw::ToolType::Function,
-                    function: ds_api::raw::FunctionCall {
-                        name: tc.name.clone(),
-                        arguments: tc.arguments.clone(),
-                    }
-                }).collect())
-            },
-            ..Default::default()
-        };
-        current_history.push(assistant_msg);
-
-        // 如果模型没有触发任何 Tool 调用，说明回答已完结，直接返回
-        if accumulated_tool_calls.is_empty() {
-            let _ = on_event.send(AgentEvent::Finished);
-            return Ok(());
-        }
-
-        // 6. 执行触发的所有工具
-        for tc in accumulated_tool_calls.values() {
-            // 发送 Tool 调用通知
-            let _ = on_event.send(AgentEvent::ToolCall {
-                name: tc.name.clone(),
-                args: tc.arguments.clone(),
-            });
-
-            // 对于快速执行的本地文件操作工具，人为引入一小段延迟，确保前端 UI 能够展现 Spinner 动画与倒计时
-            if tc.name != "Bash" {
-                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
-            }
-
-            // 检索匹配对应工具
-            let tool = tools_list.iter().find(|t| t.name() == tc.name);
-            let result_val = if let Some(t) = tool {
-                let args_json: serde_json::Value = match serde_json::from_str(&tc.arguments) {
-                    Ok(val) => val,
-                    Err(e) => serde_json::json!({ "error": format!("参数 JSON 解析错误: {}", e) }),
-                };
-                t.call(args_json).await
-            } else {
-                serde_json::json!({ "error": format!("未找到该工具: {}", tc.name) })
-            };
-
-            let result_str = result_val.to_string();
-
-            // 发送 Tool 结果通知
-            let _ = on_event.send(AgentEvent::ToolResult {
-                name: tc.name.clone(),
-                result: result_str.clone(),
-            });
-
-            // 将工具运行结果加入消息历史
-            let tool_msg = ds_api::raw::Message {
-                role: ds_api::raw::Role::Tool,
-                tool_call_id: Some(tc.id.clone()),
-                content: Some(result_str),
-                ..Default::default()
-            };
-            current_history.push(tool_msg);
-        }
-    }
-
-    // 如果循环结束但没有在循环内部提前返回，说明由于达到 max_steps 退出
-    let warning_text = "\n\n⚠️ **系统提示：** 已达到最大步数限制（15 步），任务可能未完全完成。".to_string();
-    let _ = on_event.send(AgentEvent::Text(warning_text));
-
-    let _ = on_event.send(AgentEvent::Finished);
-    Ok(())
-}
-
-#[cfg_attr(mobile, tauri::mobile_entry_point)]
-pub fn run() {
+    // 4. 启动 sidecar 进程
+    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
+    use tokio::process::Command;
+    use std::process::Stdio;
+
+    let mut cmd = Command::new(&sidecar_path);
+    cmd.stdin(Stdio::piped())
+        .stdout(Stdio::piped())
+        .stderr(Stdio::piped())
+        .env("DEEPSEEK_API_KEY", &api_key)
+        .env("OPENCODE_MODEL", &model)
+        .env("WORKSPACE_PATH", &workspace_path)
+        .env("OPENCODE_SESSION_ID", &session_id);
+
+    let mut child = cmd.spawn().map_err(|e| format!("无法启动 sidecar {}: {}", sidecar_path.display(), e))?;
+
+    // 5. 将用户 Prompt 写入 sidecar stdin，并关闭 stdin
+    let mut stdin = child.stdin.take().ok_or("无法打开 sidecar stdin".to_string())?;
+    stdin.write_all(last_user_prompt.as_bytes()).await
+        .map_err(|e| format!("写入 sidecar stdin 失败: {}", e))?;
+    drop(stdin); // 关闭 stdin，sidecar 会读取到 EOF 并开始处理
+
+    // 6. 流式读取 stdout 并转发给前端
+    let stdout = child.stdout.take().ok_or("无法获取 sidecar stdout".to_string())?;
+    let mut reader = BufReader::new(stdout).lines();
+
+    while let Some(line) = reader.next_line().await.map_err(|e| format!("读取 sidecar 输出失败: {}", e))? {
+        if let Ok(event) = serde_json::from_str::<AgentEvent>(&line) {
+            let _ = on_event.send(event);
+        } else {
+            // 如果不是 JSON，作为普通文本/思考流输出
+            if !line.trim().is_empty() {
+                let _ = on_event.send(AgentEvent::Thinking(line));
+            }
+        }
+    }
+
+    // 7. 等待进程退出并做状态校验
+    let status = child.wait().await.map_err(|e| format!("等待 sidecar 退出失败: {}", e))?;
+    if !status.success() {
+        let mut stderr_content = String::new();
+        if let Some(stderr) = child.stderr.take() {
+            let mut stderr_reader = BufReader::new(stderr).lines();
+            while let Some(line) = stderr_reader.next_line().await.unwrap_or(None) {
+                stderr_content.push_str(&line);
+                stderr_content.push('\n');
+            }
+        }
+        let err_msg = format!("Sidecar 运行失败并退出，退出码: {:?}\n错误日志:\n{}", status.code(), stderr_content);
+        let _ = on_event.send(AgentEvent::Error(err_msg.clone()));
+        return Err(err_msg);
+    }
+
+    Ok(())
+}
+
+#[cfg_attr(mobile, tauri::mobile_entry_point)]
+pub fn run() {
diff --git a/src-tauri/tauri.conf.json b/src-tauri/tauri.conf.json
index f9fbfe5..216a5c8 100644
--- a/src-tauri/tauri.conf.json
+++ b/src-tauri/tauri.conf.json
@@ -27,6 +27,9 @@
   "bundle": {
     "active": true,
     "targets": "all",
+    "externalBin": [
+      "binaries/opencode-sidecar"
+    ],
     "icon": [
       "icons/32x32.png",
       "icons/128x128.png",
diff --git a/src/App.tsx b/src/App.tsx
index 144a5a2..affd45f 100644
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -401,6 +401,7 @@ function MainDashboard() {
         selectedModel,
         apiMessages,
         savedWorkspacePath || ".",
+        currentSessionId!,
         async (event) => {
           if (event.type === "Thinking") {
             currentThinking += event.payload;
@@ -489,7 +490,8 @@ function MainDashboard() {
     } catch (err: any) {
       activeStreamingSessionRef.current = null;
       console.error("Agent execution failed:", err);
-      showToast(`Agent 执行失败: ${err.message}`);
+      const errMsg = typeof err === "string" ? err : (err?.message || String(err));
+      showToast(`Agent 执行失败: ${errMsg}`);
     }
   }
 
diff --git a/src/bridge/mock.ts b/src/bridge/mock.ts
index bca86b4..affb648 100644
--- a/src/bridge/mock.ts
+++ b/src/bridge/mock.ts
@@ -125,6 +125,7 @@ export const mockBridge: IBridge = {
     _model: string,
     _messages: any[],
     _workspaceRoot: string,
+    _sessionId: string,
     onEvent: (event: AgentEvent) => void
   ): Promise<void> {
     console.warn("[Bridge Mock] runAgent called. Simulating agent events.");
diff --git a/src/bridge/tauri.ts b/src/bridge/tauri.ts
index b260da6..7137746 100644
--- a/src/bridge/tauri.ts
+++ b/src/bridge/tauri.ts
@@ -230,6 +230,7 @@ export const tauriBridge: IBridge = {
     model: string,
     messages: any[],
     workspaceRoot: string,
+    sessionId: string,
     onEvent: (event: AgentEvent) => void
   ): Promise<void> {
     try {
@@ -242,6 +243,7 @@ export const tauriBridge: IBridge = {
         model,
         messages,
         workspaceRoot,
+        sessionId,
         onEvent: channel,
       });
     } catch (error) {
diff --git a/src/bridge/types.ts b/src/bridge/types.ts
index fa46d7b..a96c966 100644
--- a/src/bridge/types.ts
+++ b/src/bridge/types.ts
@@ -91,6 +91,7 @@ export interface IBridge {
     model: string,
     messages: any[],
     workspaceRoot: string,
+    sessionId: string,
     onEvent: (event: AgentEvent) => void
   ): Promise<void>;
 }
```

---

## 4. Sidecar 模拟输入测试与 Bug 修复记录

为了测试 Sidecar 运行并确保工具正确被调起，我们使用 `pwd` 作为 Prompt 进行了命令行级模拟测试。在此过程中发现并修复了两个关键 Bug：

### Bug 1：`opencode` 核心事件过滤错误导致的“无事件输出”
- **文件**：`opencode` 仓库下的 **[packages/core/src/session/wrapper.ts](file:///Users/denis/Sites/opencode/packages/core/src/session/wrapper.ts)**
- **现象**：向 `opencode-sidecar` 发送 Prompt 后，除了最后的 `Finished` 之外没有触发任何 Thinking、Text 或 ToolCall 流式事件输出。
- **原因**：在 `wrapper.ts` 中，使用 `event.sessionID === self.sessionID` 来过滤指定会话的事件。但在 `events` 核心发布机制中，`sessionID` 并非 Payload 的顶层属性，而是包裹在 `event.data` 属性内。导致过滤条件始终评估为 `false`，过滤了全部事件。
- **修复方式**：
  将过滤逻辑修正为通过 `data` 对象字段查找：
  ```typescript
  // 修正前
  Stream.filter((event: any) => event.sessionID === self.sessionID)
  // 修正后
  Stream.filter((event: any) => event.data?.sessionID === self.sessionID)
  ```

### Bug 2：Sidecar 属性解析错误导致的“空 Payload”
- **文件**：`deepseek-code-public` 仓库下的 **[src-sidecar/index.ts](file:///Users/denis/Sites/deepseek-code-public/src-sidecar/index.ts)**
- **现象**：解决 Bug 1 开启事件流后，输出的 JSON 对象中 `payload` 字段均为空。例如：`{"type":"ToolCall","payload":{}}`，没有工具名称或参数。
- **原因**：`index.ts` 在处理 `rawEvent` 时，直接尝试提取顶层属性（如 `rawEvent.tool` 或 `rawEvent.delta`）。实际上，所有事件的主体载荷字段都在 `rawEvent.data` 下。
- **修复方式**：
  将所有相关属性访问指向 `data` 对象下：
  ```typescript
  rawEvent.delta      ->  rawEvent.data?.delta
  rawEvent.tool       ->  rawEvent.data?.tool
  rawEvent.input      ->  rawEvent.data?.input
  rawEvent.structured ->  rawEvent.data?.structured
  rawEvent.error      ->  rawEvent.data?.error
  ```

### 最终模拟测试成功的输出结果
在完成上述两个 Bug 的修复并使用 `bun run build:sidecar` 重新编译后，测试命令：
```bash
echo "运行 pwd" | DEEPSEEK_API_KEY=... WORKSPACE_PATH=... OPENCODE_MODEL=deepseek-chat ./src-tauri/binaries/opencode-sidecar-aarch64-apple-darwin
```
输出了非常完美的事件和工具响应流：
```json
{"type":"ToolCall","payload":{"name":"bash","args":"{\"command\":\"pwd\",\"description\":\"Print current working directory\"}"}}
{"type":"ToolResult","payload":{"result":"{\"command\":\"pwd\",\"cwd\":\"/Users/denis/Sites/deepseek-code-public\",\"exitCode\":0,\"output\":\"/Users/denis/Sites/deepseek-code-public\\n\",\"truncated\":false}"}}
{"type":"Text","payload":"当前"}
{"type":"Text","payload":"工作"}
{"type":"Text","payload":"目录"}
{"type":"Text","payload":"是"}
{"type":"Text","payload":" `/"}
{"type":"Text","payload":"Users"}
{"type":"Text","payload":"/"}
{"type":"Text","payload":"den"}
{"type":"Text","payload":"is"}
{"type":"Text","payload":"/S"}
{"type":"Text","payload":"ites"}
{"type":"Text","payload":"/de"}
{"type":"Text","payload":"ep"}
{"type":"Text","payload":"seek"}
{"type":"Text","payload":"-code"}
{"type":"Text","payload":"-public"}
{"type":"Text","payload":"`"}
{"type":"Text","payload":"。"}
{"type":"Finished","payload":null}
```
工具能够被成功调起、获取正确输出，并完成了大模型后续文本流的生成与推送。

---

## 8. 右侧预览区 UI 重构（右侧面板可调宽度 / 夜间模式 / 工具分类）

### 8.1 右侧预览区宽度可调

**文件**：[RightPanel.tsx](file:///Users/denis/Sites/deepseek-code-public/src/components/RightPanel.tsx)、[App.tsx](file:///Users/denis/Sites/deepseek-code-public/src/App.tsx)、[TitleBar.tsx](file:///Users/denis/Sites/deepseek-code-public/src/components/TitleBar.tsx)、[App.css](file:///Users/denis/Sites/deepseek-code-public/src/App.css)

- `RightPanel` 新增 `width` / `onWidthChange` props，宽度由父组件 `App.tsx` 通过 `rightPanelWidth` state 统一管理（默认 320px，拖动范围 240–900px）。
- 面板左边缘新增 5px 透明拖拽手柄（`.right-panel-resize-handle`），悬停显示蓝色高亮，拖动时 cursor 变为 `col-resize`。
- TitleBar 的右侧 tab 区域（`.titlebar-right-panel-header`）接收 `rightPanelWidth` prop，宽度与面板实时同步，避免对不齐。
- 移除了 `.right-panel > *` 中的硬编码 `min-width: 320px` 约束，改为 `collapsed` 时 `width: 0 !important`，打开时宽度由内联样式控制。

### 8.2 预览区样式与工具区统一 / 夜间模式

**文件**：[App.tsx](file:///Users/denis/Sites/deepseek-code-public/src/App.tsx)、[TitleBar.tsx](file:///Users/denis/Sites/deepseek-code-public/src/components/TitleBar.tsx)、[App.css](file:///Users/denis/Sites/deepseek-code-public/src/App.css)

- 新增 `isNightMode` 布尔 state，切换时在 `.app-container` 上加/移除 `night-mode` class。
- TitleBar 加入月亮/太阳切换按钮（右侧面板打开/关闭时均可见），激活时按钮高亮为蓝色。
- 日间模式下右侧预览区使用浅色主题（白色背景 + `#f6f6f6` 文件头 + 灰色行号栏），与聊天区工具卡片视觉语言一致。
- 夜间模式下通过 `.night-mode` 选择器级联覆盖全局颜色：标题栏、左侧栏、聊天区、工具卡片、右侧预览区全部变暗，只有 `bash` 终端样式面板本身始终是深色（不受影响）。
- CSS 新增 `.rp-file-header`、`.rp-file-name`、`.rp-file-lang`、`.rp-file-body`、`.rp-source-view`、`.rp-line-numbers`、`.rp-code-content` 等浅色文件查看器样式类。

### 8.3 FileRead 工具卡片改为文件链接 + Markdown 内嵌 Tab

**文件**：[ToolCallCard.tsx](file:///Users/denis/Sites/deepseek-code-public/src/components/ToolCallCard.tsx)、[RightPanel.tsx](file:///Users/denis/Sites/deepseek-code-public/src/components/RightPanel.tsx)、[App.css](file:///Users/denis/Sites/deepseek-code-public/src/App.css)

- `read` 工具卡片不再展开文件内容，改为一行显示：状态圆点 + 工具名 + 可点击蓝色文件名链接，点击直接在右侧预览区打开。
- 右侧预览区的 Markdown 文件改用内嵌 Tab 栏（`Preview` / `Source`）代替原来头部的胶囊按钮，Tab 样式与 TitleBar 一致（蓝色底部边框高亮激活态）。
- CSS 新增 `.rp-inner-tabs`、`.rp-inner-tab` 样式，并在 `.night-mode` 下同步覆盖。

### 8.4 工具统一分类处理

**文件**：[ToolCallCard.tsx](file:///Users/denis/Sites/deepseek-code-public/src/components/ToolCallCard.tsx)

基于 opencode 源码（`packages/opencode/src/tool/`）梳理所有工具的真实 ID（全小写），统一分为两类：

**预览区工具**（`PREVIEW_TOOLS` 集合）：`read` / `write` / `edit` / `apply_patch` 及旧版兼容名
- 渲染为一行文件链接卡片（`FileToolCard`），点击打开右侧预览区，不提供展开/折叠。

**工具区展开工具**：`bash` / `glob` / `grep` / `todowrite` / `webfetch` / `websearch` / `plan` / `plan_exit` / `task` / `skill` / `question` 等
- 渲染为可展开/折叠卡片（`ExpandableToolCard`），输出留在工具区，**不显示「在新标签页打开」按钮**。

同时移除了旧版 `normalizeToolName` 首字母大写映射（`FileRead`→`FileRead` 等），统一改用 opencode 原生小写 ID。新增 `useElapsed` 和 `detectError` 辅助函数消除重复代码。

---

## 9. 思维链融入对话答复（去背景框与边框）

### 9.1 思维链去框融合

**文件**：[App.css](file:///Users/denis/Sites/deepseek-code-public/src/App.css)

- 移除了 `.thinking-block` 和 `.night-mode .thinking-block` 的背景色（改为 `transparent`），去除了左边框 `border-left`、边框圆角 `border-radius` 及内边距 `padding: 0`。
- 调整了思维链在日间与夜间模式下的文字颜色（日间：`#8e8e93` / hover `#636366`；夜间：`#636366` / hover `#8e8e93`），使其直接放置在对话区上方，与主答复文本自然融为一体，同时通过等宽（monospace）字体和稍浅的文字色与主正文作层次区分。
- 优化了 collapsed (折叠) 状态下的颜色和流式输入时光标的颜色，确保视觉连贯性。

