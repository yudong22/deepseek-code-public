# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 开发流程（AI 必读）

### 1. 开发前：读规范
动手前先看相关文件现有的风格：
- `.editorconfig` — 缩进 / 换行 / 文件末尾规则
- `scripts/lint.sh` — CI 跑哪些 lint、忽略什么
- 同目录已有文件 — 命名 / import / 注释风格

### 2. 开发中：遵守约束
- 缩进：**2 空格**（Rust 4 空格，Makefile tab）
- 文件末尾：**留一个空行**
- 行尾：**不保留尾随空格**
- 长字符串 / 模板：避免 YAML 解析陷阱（`:` 后面要空格或换行）

### 3. 开发后：跑 lint
**所有改动后**必须跑：

```bash
bun run lint
```

**lint 包含**：
| 检查项 | 工具 | 触发条件 |
|---|---|---|
| tab 字符（必须是空格） | 自研 `check-tabs.sh` 内嵌 | 任何文本文件 |
| Shell 脚本错误（warning 级以上） | shellcheck | `*.sh` 文件 |
| GitHub Actions 语法 | actionlint | `.github/workflows/*.yml` |

**lint 失败处理**：
- 必 fix：error 级别（shellcheck error/actionlint error）—— lint 直接 fail，CI 红
- 建议修：warning/info 级别（当前被 ignore）—— 不 block，但应该在 PR 描述里提一下
- 加 ignore：在 `scripts/lint.sh` 的对应 linter 命令行加 `-ignore` 模式，禁止在源文件里加 `# noqa`

### 4. 提交前
```bash
bun run lint   # 必须 pass
git diff       # 复核改动范围
git status     # 确认无意外文件
```

**违规后果**：CI `Lint` step 失败，PR 不能 merge。

## 未来 lint 扩展

加新语言 lint 在 `scripts/lint.sh` 里加 case（注释里有模板），不要在 `package.json` 加新 script。命令统一是 `bun run lint`。

## Project Overview

`deepseek-code` (also known as **OpenHands**) is a local AI programming assistant with a C/S (client-server) self-healing pipeline architecture. It combines:
- **Tauri v2 + React 19 desktop client** with streaming agent events via Tauri Channels
- **Rust-native agent loop** (`sidecar-agent` crate, v0.5.0) — LLM calls, tool execution, event streaming all in-process
- **Go API gateway** with JWT auth, LLM proxy, and Qdrant vector memory
- **CLI tool** (`openhands`) for git worktree-isolated agent pipelines with auto-validation and self-healing

**v0.5.0**: 桌面端代理引擎从 75MB Bun 子进程重写为进程内 Rust library crate。CLI 保留 TypeScript sidecar。

## Development Commands

```bash
bun install                          # Install all workspace dependencies
bun run dev:desktop                  # Web mode (browser, mock backend, no Rust) — 快速迭代 UI
bun run preview                      # 桌面端开发模式 (Tauri + Rust + SQLite)
bun run build:desktop                # 构建前端 (sidecar + tsc + vite build)，tauri build 会自动调用
bun run build:mac                    # 构建 macOS .app，终止旧实例，复制到 /Applications
bun run build:sidecar                # 单独编译 sidecar 二进制 (packages/sidecar/src/index.ts → Bun)
bun run test                         # 全量检查：302 tests (99 Rust + 203 TS)
bun run scripts/bump-version.ts <ver> # 统一更新所有配置文件的版本号
```

**Test specific targets:**
```bash
bun test apps/desktop/src/bridge/bridge.test.ts           # Mock bridge (14 tests)
bun test packages/client-cli/src/openhands.test.ts         # CLI pipeline + Q&A protocol (28 tests)
bun test packages/client-cli/src/cli.test.ts               # Config/plan/memory sync (34 tests)
bun test packages/sidecar/src/index.test.ts                # Sidecar event routing (49 tests)
bun test packages/client-cli/src/ui-utils.test.ts          # UI utils pure functions (21 tests)
bun test packages/client-cli/src/protocol.test.ts          # Sidecar stdin/stdout contract (29 tests)
bun test apps/desktop/src/ag-ui/adapter.test.ts            # AG-UI adapter mapping (24 tests)
bun test ./apps/desktop/src/utils/markdown.test.tsx         # Markdown renderer (4 tests)
```

**Go Gateway:**
```bash
cd packages/gateway && go run main.go              # Start the Go gateway server (port 8080)
docker compose up                                  # Start Gateway + Qdrant via Docker
```

**CLI tool (离线模式无需网关):**
```bash
# 在线模式（需要 Go 网关运行中）
bun openhands login --server http://localhost:8080 --id openhands --secret secret123
bun openhands doctor                               # Environment dependency audit
bun openhands run "修复类型错误"                    # Self-healing pipeline (走网关)
bun openhands memory sync --commit HEAD            # Sync experience to vector DB

# 离线模式（v0.4.0，多供应商 + 本地配置）
bun openhands plan "添加用户登录"                   # AI 需求分析，生成技术方案
bun openhands run --from-plan .plan.md "添加用户登录" # 基于方案执行开发
bun openhands run "输出 hello world"               # Self-healing pipeline (直连)
bun openhands run --provider openai "修复 bug"      # 指定供应商覆盖默认配置
```

## Architecture

### Monorepo Workspace (Bun Workspaces)

This is a multi-package workspace at `deepseek-code-public/`:

```
deepseek-code-public/
├── apps/desktop/           # Tauri v2 + React 19 桌面客户端 (main entry here)
├── packages/
│   ├── gateway/            # Go API gateway: JWT auth, LLM proxy, Qdrant vector memory
│   ├── client-cli/         # CLI tool (@openhands/cli): login, doctor, run, memory sync
│   └── sidecar/            # opencode-sidecar binary source (compiled via bun build --compile)
├── .agents/                # AI pipeline config: agent routing, tech rules, verification pipeline
├── docker-compose.yml      # Gateway (Go) + Qdrant (vector DB) container orchestration
└── docs/                   # route-map.md (code structure), preview.md (pipeline design)
```

### Dual-Environment Bridge Pattern (apps/desktop/src/bridge/)

The frontend never calls Tauri APIs directly. All backend communication goes through `src/bridge/`, which detects the runtime environment and routes to the correct implementation:

- **`types.ts`** — `IBridge` interface defining the full API contract (greet, initDb, saveSession, getSessions, saveMessage, getMessages, getSetting/saveSetting/deleteSetting, selectDirectory, runAgent, cancelAgent, listWorkspaceFiles, readFile, getFileUrl, checkForUpdates)
- **`index.ts`** — Facade: checks `window.__TAURI_INTERNALS__` to select Tauri or mock
- **`tauri.ts`** — Tauri implementation: SQLite via `tauri-plugin-sql`, agent via `invoke("run_agent_loop", ...)` with a `Channel<AgentEvent>` for streaming, workspace file ops, GitHub release update check
- **`mock.ts`** — Browser fallback: localStorage for persistence, simulated agent events, mock file returns
- **`bridge.test.ts`** — Unit tests for mock bridge (Bun test runner, `describe`/`test`/`expect`)

### Agent Loop (v0.5.1)

**桌面端**：代理循环在 Tauri 进程内运行，通过 `sidecar-agent` Rust library crate：

`apps/desktop/src-tauri/crates/sidecar-agent/src/`:
- **`agent.rs`** — 主代理循环：LLM SSE 流 → ToolCall → 工具执行 → tool result → 下一轮（最多 25 步）。
  v0.5.1: 只读工具（grep/glob/file_read）通过 `spawn_blocking` + `join_all` 并行执行，
         写入工具（bash/file_write/file_edit）和问答工具保持串行。
- **`tools/mod.rs`** — Tool trait 新增 `is_read_only()` 方法；ToolRegistry 改用 `Arc<dyn Tool>` 支持跨线程共享
- **`protocol.rs`** — 17 AgentEvent 类型（自定义 Serialize 确保 `"payload": null`），stdin 解析，工具结果增强
- **`provider.rs`** — 4 供应商 SSE 流（OpenAI-compatible），`ChatCompletionRequest` 序列化，SSE chunk 解析
- **`tools/`** — 7 工具：`bash`(mutating)/`file_read`(read-only)/`file_write`(mutating)/`file_edit`(mutating)/`grep`(read-only)/`glob`(read-only)/`question`(serial)
- **`session.rs`** — SQLite 会话管理（`.opencode/opencode.db`）

`apps/desktop/src-tauri/src/lib.rs`:
- `AgentState` — 共享状态：`Arc<AtomicBool>` cancel_flag + `mpsc::UnboundedSender` answer channel + `watch::Sender` cancel notify
- `run_agent_loop` — 创建 Agent，tokio::spawn，forward 事件到 Tauri Channel
- `respond_to_agent` — 直接 `answer_tx.send()`（无需 Mutex）
- `cancel_agent` — 设置 cancel_flag + `cancel_tx.send(true)`

**CLI 工具 (`openhands run`)**：仍使用 `packages/sidecar/src/index.ts` + `@opencode-ai/core`（Bun 运行时）

| 组件 | 代理引擎 | 说明 |
|------|----------|------|
| 桌面端 (Tauri) | Rust `sidecar-agent` crate | 进程内，无子进程 |
| CLI (`openhands run`) | TS + `@opencode-ai/core` | `bun run` 执行 |

### Agent Event Lifecycle

17 种 AgentEvent 类型，Tauri 端和 sidecar-agent 端各有一份定义，通过 `From` trait 自动转换：

| AgentEvent | Payload | 说明 |
|---|---|---|
| `ThinkingStarted` | `null` | 推理块开始 |
| `Thinking` | `String` | 推理文本增量 |
| `ThinkingEnded` | `null` | 推理块结束 |
| `TextStarted` | `null` | 文本块开始 |
| `Text` | `String` | 回复文本增量 |
| `TextEnded` | `null` | 文本块结束 |
| `ToolCall` | `{ name, args, call_id }` | 工具被调用 |
| `ToolStarted` | `{ call_id }` | 工具开始执行 |
| `ToolSuccess` | `{ name, result, call_id }` | 工具成功 |
| `ToolFailed` | `{ name, error, call_id }` | 工具失败 |
| `ToolEnded` | `{ call_id }` | 工具执行结束 |
| `StepStarted` | `null` | Step 开始 |
| `StepEnded` | `null` | Step 结束 |
| `Finished` | `null` | Agent 完成 |
| `Error` | `{ message }` | 错误 |
| `Usage` | `{ tokens_input, tokens_output, tokens_reasoning? }` | Token 用量 |

### Go API Gateway (packages/gateway/)

The Go server provides:

- **`POST /login`** — OAuth2 client credentials auth, returns 5-minute JWT
- **`POST /v1/chat/completions`** — LLM proxy to DeepSeek (or any OpenAI-compatible endpoint), JWT-protected, SSE streaming
- **`POST /api/memory/search`** — Qdrant vector search: embeds the prompt, queries top-3 memories (similarity ≥ 0.70), returns matched experiences (prompt, git_diff, error_log, project_id)
- **`POST /api/memory/sync`** — Upserts a memory point into Qdrant (embedding + payload with git diff, error log, project info)
- **`GET /api/health`** — Health check with user_id

Auto-creates a Qdrant `memory` collection (1536-dim, Cosine distance) on startup. Embeddings via `text-embedding-3-small` (OpenAI) or mock vectors when using DeepSeek API base.

### Self-Healing Agent Pipeline (packages/client-cli/)

The `openhands run <task>` command implements a full self-healing pipeline:

1. **Isolation**: Creates a git worktree sandbox at `/tmp/ai-workers/<taskId>` from branch `main`
2. **Memory Retrieval**: Fetches relevant past experiences from Go gateway (在线模式) 或本地 `~/.openhands/memories.json` (离线模式, 关键词 Jaccard 匹配)
3. **Agent Execution (v0.4.0)**: 统一使用 **OpenCode sidecar** (`mode='code'`) 写代码，不再依赖外部 Hermes CLI
4. **Fast Validation**: Runs `fastValidate()` — matches modified files against config-driven verification rules
5. **Self-Heal Loop**: If validation fails (up to 3 attempts), runs OpenCode sidecar 在 `mode='heal'` 下修复报错
6. **Local Memory Save**: 成功后自动保存经验到 `~/.openhands/memories.json`（本地永久记忆）
7. **Auto Gateway Memory Sync** (v0.3.3+): 有网关时同步经验到网关
8. **Commit & Cleanup**: On success, commits locally and removes the worktree. On failure, performs safe rollback

**v0.4.0 关键改进：**
- **弃 Hermes**: 不再依赖外部 `hermes` CLI，管线简化为纯 OpenCode（Bun/TS）
- **`openhands plan`**: 新增子命令，AI 分析需求生成技术方案（`.plan.md`），满足"前期讨论"需求
- **多供应商离线配置**: `~/.openhands/config.json` 支持 `providers` 字段配置多组 API key/Base URL/Model
- **本地记忆库**: 离线模式下自动从 `~/.openhands/memories.json` 检索相关经验，成功后自动保存
- **模型名自动归一化**: 去掉 `provider/` 前缀（`deepseek/deepseek-chat` → `deepseek-chat`），非标准模型名给出警告

**v0.4.1 关键改进：**
- **交互式 Q&A（CLI + 桌面端）**: agent 可以通过 question 工具提问，CLI 终端或桌面端 QuestionCard 卡片展示问题和选项，等待用户输入
- **`session.respond()`**: opencode wrapper 新增方法，向运行中的 session 注入 steer 输入
- **Sidecar 行协议**: stdin 改为行协议（首行 prompt，后续行为用户回复），`session.prompt()` 与回答读取器并发运行
- **Rust `respond_to_agent`**: 新 Tauri 命令，保持 sidecar stdin 开启，写入用户输入
- **QuestionCard 组件**: React 组件，日间/夜间模式，选中后冻结高亮显示，刷新后恢复状态
- **空闲检测优化**: 30s 无事件自动警告，超时报错含最后事件类型和模型名
- **CLI 单元测试**: 新增 19 个测试（本地记忆 CRUD、plan API mock、参数解析、多供应商配置）
- **`--from-plan`**: `openhands run` 支持读取 `.plan.md` 作为额外 system context
- **`--provider` / `--model`**: CLI 参数运行时覆盖默认供应商和模型
- **Sidecar 超时**: 默认 300s（`SIDECAR_TIMEOUT_MS`，v0.5.7 修正错误信息）

关键文件:
- `packages/client-cli/src/cli.ts` — 主入口：login / doctor / plan（v0.4.0 新增）/ run / memory sync，含离线模式检测、多供应商配置、本地记忆库
- `packages/client-cli/src/openhands-call.js` — Agent 调度器（OpenCode-only）：mode='code'/'heal' 双模式，env 传递，超时，JSON stdin
- `packages/sidecar/src/index.ts` — 侧车入口：JSON/纯文本 stdin → Session → 流式事件
- `packages/gateway/main.go` — Go 网关：JWT 24h、LLM 代理、Qdrant + 本地 JSON 记忆

The `fastValidate` utility (`packages/client-cli/src/fast-validate.js`) reads `.agents/config.yaml` to match modified files against pipeline rules:

```yaml
# From .agents/config.yaml
verification_pipeline:
  project_tauri:
    match: "src-tauri/**/*"
    cmd: "cargo check --manifest-path src-tauri/Cargo.toml"
  project_frontend:
    match: "src/**/*"
    cmd: "bun test src/bridge/bridge.test.ts"
  project_sidecar:
    match: "src-sidecar/**/*"
    cmd: "bun run build:sidecar"
```

### Frontend (apps/desktop/src/)

- **Single-page architecture**: `App.tsx` (~1040 lines) contains the entire UI state — `MainDashboard` component with custom titlebar, dual collapsible sidebars, chat panel, Mermaid rendering, settings modal, and toast notifications
- **Components** (`src/components/`): `ChatFeed`, `ChatInputCard`, `ChatInput`, `EmptyState`, `Icons`, `LeftSidebar`, `Mermaid`, `RightPanel`, `SettingsModal`, `TitleBar`, `Toast`, `ToolCallCard`, `FileToolCard`, `FileAutocomplete`, `EditDiffCard`, `ExpandableToolCard`, `TodoListCard`, `SlashAutocomplete`, `toolUtils`
- **Hooks** (`src/hooks/`): `useToast`, `useSettings`, `useProjects`, `useRightPanelTabs`, `useKeyboardShortcuts`
- **Routing**: HashRouter with 2 routes — `/` (new conversation, renders `EmptyState`) and `/chat/s/:id` (active session, renders `MainDashboard`)
- **Custom markdown renderer**: `src/utils/markdown.tsx` — hand-written parser for headers (h3 only), lists, code blocks, inline formatting, tables, and ```mermaid blocks (rendered with the `mermaid` library)
- **State management**: Plain React `useState`/`useRef` — no external library
- **Alias**: `@/` maps to `src/` via Vite `resolve.alias`

### Database Schema (SQLite: `deepseek_code.db`)

- `sessions(id TEXT PK, title TEXT, lastMessage TEXT, updatedAt TEXT, projectName TEXT)`
- `messages(id TEXT PK, sessionId TEXT, role TEXT, content TEXT, createdAt TEXT, reasoningContent TEXT, filesChanged TEXT, artifacts TEXT, toolCalls TEXT, sections TEXT, completedAt TEXT, elapsed TEXT)`
- `settings(key TEXT PK, value TEXT)` — used for API key, workspace path, and projects list

### Agent Configuration (.agents/config.yaml)

Controls multi-agent routing, tech rules, and verification pipeline:

```yaml
agent_routing:
  default:                              # v0.4.0: 合并为单一 OpenCode Agent
    model: "deepseek/deepseek-v4-flash"
    temperature: 0.2
verification_pipeline:
  project_tauri:
    match: "src-tauri/**/*"
    cmd: "cargo check --manifest-path src-tauri/Cargo.toml"
```

Template rendering: `agent.md` files can use `{{project_id}}`, `{{components}}`, `{{tech_rules}}` placeholders that the CLI pipeline resolves before spawning agents.

### Sidecar 架构 (v0.5.0)

**桌面端 (Tauri)**：进程内 Rust library crate `sidecar-agent`：

```
apps/desktop/src-tauri/
├── Cargo.toml              # 依赖 sidecar-agent = { path = "crates/sidecar-agent" }
├── src/lib.rs              # AgentState, run_agent_loop, respond_to_agent, cancel_agent
└── crates/sidecar-agent/
    ├── Cargo.toml          # reqwest, eventsource-stream, rusqlite, tokio
    └── src/
        ├── lib.rs          # pub mod protocol/provider/tools/agent/session
        ├── protocol.rs     # AgentEvent, parse_stdin_input, build_tool_success_result (99 tests)
        ├── provider.rs     # SSE stream, ChatCompletionRequest, SseChunk (18 tests)
        ├── agent.rs        # 主代理循环：SSE 流 → ToolCall → 执行 → 下一轮
        ├── session.rs      # SQLite: sessions/messages/events 表 (3 tests)
        └── tools/
            ├── mod.rs      # Tool trait + ToolRegistry
            ├── bash.rs     # shell 命令执行
            ├── file_read.rs # 文件读取（路径遍历保护）
            ├── file_write.rs # 文件写入
            ├── file_edit.rs # 搜索替换（生成 diff）
            ├── grep.rs     # rg/grep 搜索
            ├── glob.rs     # walkdir + glob 匹配
            └── question.rs # 交互式 Q&A（agent 层处理阻塞）
```

**关键设计决策**：
- `ChatMessage` 有两个独立结构体：`ToolCallFunctionDef`（`arguments: String` 用于 assistant 消息）和 `FunctionDef`（`parameters: Value` 用于 tools 数组）
- `build_tool_success_result` 支持两种输入格式：opencode 嵌套 `{result: {}}` 和 Rust 工具扁平 `{stdout, stderr, exit_code}`
- **v0.5.1: 并行工具执行**：只读工具（grep/glob/file_read）通过 `spawn_blocking` + `join_all` 并行执行，写入工具保持串行。Tool trait 新增 `is_read_only()`，ToolRegistry 使用 `Arc<dyn Tool>` 支持跨线程共享
- **v0.5.1: 自动续写**：SSE 解析器新增 `FinishReason` 变体；LLM 返回 `finish_reason="length"` 时 agent 自动注入续写消息（上限 5 次），不消耗 25 步预算
- question 工具通过 `tokio::select!` 同时等待用户回答和取消信号，失败时也推送 tool 消息满足 API 契约
- 错误处理：`run()` 包装 `run_inner()`，所有错误先发 `AgentEvent::Error` 再返回

**CLI 工具 (`openhands run`)**：仍使用 `packages/sidecar/src/index.ts` + `@opencode-ai/core`（Bun 运行时）

### v0.5.1 关键改进

| 改进 | 说明 |
|------|------|
| **只读工具并行执行** | grep/glob/file_read 通过 `spawn_blocking` + `futures::future::join_all` 并行运行 |
| **Tool 分区模型** | 只读(multiple) vs 写入(serial) 两阶段执行，Tool trait 新增 `is_read_only()` 方法 |
| **Arc 共享注册表** | ToolRegistry 改用 `Arc<dyn Tool>`，`find()` 返回可跨线程 clone 的 Arc |
| **max_tokens 自动续写** | SseChunk 新增 `FinishReason`；检测 `finish_reason="length"` 时自动注入续写消息，不消耗 step 预算 |

### v0.5.0 关键改进

| 改进 | 说明 |
|------|------|
| **Rust 代理引擎** | 75MB Bun 二进制 → 进程内 Rust crate，消除子进程开销 |
| **二进制体积** | 桌面端不再需要 `externalBin`，`tauri.conf.json` 已移除 |
| **启动延迟** | ~200ms (spawn) → ~0ms (函数调用) |
| **API 协议修复** | tool 消息 `tool_call_id`、assistant 消息 `arguments` vs `parameters` 分离 |
| **工具结果保留** | `build_tool_success_result` 兼容扁平格式 |
| **Q&A 取消** | `tokio::select!` + watch channel，cancel 可中断等待 |
| **工具调用闭环** | question 工具失败时也推送 tool 消息，满足 API 契约 |

### 测试覆盖

| 测试套件 | 测试数 | 说明 |
|----------|--------|------|
| `cargo test` (sidecar-agent) | 99 | Rust 代理核心（protocol/provider/tools/session）|
| `bun run test` | 203 | TypeScript CLI/bridge/sidecar/adapter/markdown |
| **总计** | **302** | |

### Docker Compose

```yaml
# docker-compose.yml — Gateway (port 8080) + Qdrant (ports 6333, 6334)
services:
  gateway:  # ./packages/gateway/ with Dockerfile (golang:1.22-alpine)
  qdrant:   # qdrant/qdrant:latest with ./backend/qdrant_data volume
```

### CI/CD

- **`release-mac.yml`**: GitHub Actions workflow for macOS builds. Triggered on `v*` tags or manually. Builds for `aarch64-apple-darwin` using `tauri-apps/tauri-action`, supports Apple code signing/notarization via secrets.

### Tauri Configuration

- **`tauri.conf.json`**: Window set to 1280×800 with `titleBarStyle: "Overlay"` and `hiddenTitle: true` for custom titlebar. v0.5.0 移除了 `externalBin`（agent 改为进程内）。Security CSP set to `null` (permissive).
- **`capabilities/default.json`**: SQLite plugin permissions for `deepseek_code.db`, window drag, and opener plugin.

## Conventions

- **Language**: All implementation plans, code comments, and in-app text must be in Chinese
- After feature development: run `bun run test` (302 tests: 99 Rust + 203 TS)，update `docs/route-map.md` if new components/routes/commands were added
- Prefer `bun run dev:desktop` for UI work (fast iteration in browser without Rust compilation)
- **Rust agent**: 修改 `sidecar-agent` crate 后运行 `cargo test` (在 `apps/desktop/src-tauri/crates/sidecar-agent/` 目录)
- **CLI sidecar**: `packages/sidecar/` 仅供 CLI 工具使用，桌面端不再依赖
- **`build:sidecar`**: 仅编译 CLI 用的 sidecar 源码，桌面端不再需要

## Release Checklist（版本发布检查清单）

发布新版本时，AI 需要执行以下步骤。**首次发布必须依次执行，后续版本可跳过已完成的步骤。**

### 1. 同步版本号
`scripts/bump-version.ts` 会统一更新以下 5 个文件：
```
bun run scripts/bump-version.ts <version>   # 例如 0.5.0
```

| # | 文件 | 说明 |
|---|------|------|
| 1 | `update.json` | Tauri 自动更新清单（version + pub_date + 下载 URL） |
| 2 | `apps/desktop/src-tauri/Cargo.toml` | Rust 桌面端版本（line 3: `version = "..."`） |
| 3 | `apps/desktop/package.json` | 桌面端前端版本（`import.meta.env.VITE_APP_VERSION` 来源） |
| 4 | `packages/client-cli/package.json` | CLI 工具版本 |
| 5 | `packages/sidecar/package.json` | Sidecar 版本 |

同步后检查：`git diff --stat` 确认 5 个文件均已更新。

### 2. 更新文档
- 更新 `CLAUDE.md` 中的版本号引用（如果有）
- 更新 `docs/route-map.md` 中的新组件/命令/路由说明

### 3. 构建 + 签名
```
bun run build:mac                         # 构建 macOS .app
```
**重要:** `.tauri/updater.key` 是 minisign 私钥，用于签署更新归档。构建完成后，手动执行为每个平台签名：

```bash
# Apple Silicon (M1/M2/M3/M4)
bun run scripts/sign-update.ts \
  apps/desktop/src-tauri/target/release/bundle/macos/deepseek-code_aarch64.app.tar.gz \
  darwin-aarch64

# Intel Mac
bun run scripts/sign-update.ts \
  apps/desktop/src-tauri/target/release/bundle/macos/deepseek-code_x86_64.app.tar.gz \
  darwin-x86_64
```
该脚本会自动调用 minisign 签署归档文件，并将签名写入 `update.json`。

**手动签名 (若脚本不可用):**
```
minisign -Sm apps/desktop/src-tauri/target/release/bundle/macos/deepseek-code_aarch64.app.tar.gz -s .tauri/updater.key
cat apps/desktop/src-tauri/target/release/bundle/macos/deepseek-code_aarch64.app.tar.gz.minisig
```
将 .minisig 文件内容复制到 `update.json` 中对应平台的 `signature` 字段。

### 4. 提交 + 打标签 + 推送
```
git commit -m "release: v<version>"
git tag v<version>
git push origin main v<version>
```

### 5. 创建 GitHub Release
在 https://github.com/yudong22/deepseek-code-public/releases/new
- Tag: v<version>
- 上传 .dmg / .app.tar.gz 构建产物
- 写入更新日志
