# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`deepseek-code` (also known as **OpenHands**) is a local AI programming assistant with a C/S (client-server) self-healing pipeline architecture. It combines:
- **Tauri v2 + React 19 desktop client** with streaming agent events via Tauri Channels
- **Go API gateway** with JWT auth, LLM proxy, and Qdrant vector memory
- **CLI tool** (`openhands`) for git worktree-isolated agent pipelines with auto-validation and self-healing
- **Sidecar agent process** (`opencode-sidecar`) that runs the actual opencode agent loop with 6 file/code tools

The Rust backend spawns an external sidecar binary that runs the agent loop, streaming results to the React frontend via Tauri Channels.

## Development Commands

```bash
bun install                          # Install all workspace dependencies
bun run dev:desktop                  # Web mode (browser, mock backend, no Rust) — 快速迭代 UI
bun run preview                      # 桌面端开发模式 (Tauri + Rust + SQLite)
bun run build:desktop                # 构建前端 (sidecar + tsc + vite build)，tauri build 会自动调用
bun run build:mac                    # 构建 macOS .app，终止旧实例，复制到 /Applications
bun run build:sidecar                # 单独编译 sidecar 二进制 (packages/sidecar/src/index.ts → Bun)
bun run test                         # 全量检查：cargo check + bun test
```

**Test specific targets:**
```bash
bun test apps/desktop/src/bridge/bridge.test.ts   # Mock bridge unit tests
bun test packages/client-cli/src/openhands.test.ts # CLI pipeline unit tests
```

**Go Gateway:**
```bash
cd packages/gateway && go run main.go              # Start the Go gateway server (port 8080)
docker compose up                                  # Start Gateway + Qdrant via Docker
```

**CLI tool (requires Go gateway running):**
```bash
bun openhands login --server http://localhost:8080 --id openhands --secret secret123
bun openhands doctor                               # Environment dependency audit
bun openhands run "修复类型错误"                    # Self-healing pipeline
bun openhands memory sync --commit HEAD            # Sync experience to vector DB
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

### Sidecar Agent Loop

The core agent loop runs outside the Tauri Rust backend, in an external sidecar process (`opencode-sidecar`):

1. **`apps/desktop/src-tauri/src/lib.rs:run_agent_loop`** — Tauri async command that:
   - Receives API key, model name, message history, workspace root, and sessionId
   - Locates and spawns the external sidecar binary (configured in `tauri.conf.json` as `externalBin`)
   - Passes `DEEPSEEK_API_KEY`, `OPENCODE_MODEL`, `WORKSPACE_PATH`, `OPENCODE_SESSION_ID` as environment variables
   - Writes the last user prompt to the sidecar's `stdin` and closes it
   - Reads the sidecar's `stdout` stream line-by-line: parses JSON `AgentEvent`s and streams them to the frontend via `Channel<AgentEvent>`
   - Checks the exit code of the sidecar process, and forwards error logs from `stderr` if execution failed
   - Supports cancellation via `AgentCancelled` atomic flag (set by `cancel_agent` command)
   - Also registers Tauri commands: `select_directory`, `cancel_agent`, `list_workspace_files`, `read_text_file`, `resolve_file_path`, `read_file_base64` (with path traversal protection)

2. **`packages/sidecar/src/index.ts`** — The agent entry point, compiled into a standalone binary via `bun build --compile`:
   - Imports `Session` from the external `opencode` package (at `../opencode/packages/core/`)
   - Maps DeepSeek/OpenAI/Anthropic/Google provider IDs from the model string
   - Calls `session.prompt(prompt, callback)` which drives the full agent loop
   - Streams events as JSON lines to stdout: `Thinking`, `Text`, `ToolCall/ToolStarted/ToolSuccess/ToolFailed/ToolEnded`, `StepStarted/StepEnded`, `Usage`, `Error`, `Finished`
   - Reads token usage from `opencode.db` SQLite after completion

### Agent Event Lifecycle

The sidecar bridges opencode's event system to deepseek-code via JSON lines on stdout. The `AgentEvent` enum in `src-tauri/src/lib.rs` defines all recognized event types using `#[serde(tag = "type", content = "payload")]`:

| OpenCode Event | AgentEvent Type | Payload |
|---|---|---|
| `reasoning.started` | `ThinkingStarted` | `null` |
| `reasoning.delta` | `Thinking` | `String` |
| `reasoning.ended` | `ThinkingEnded` | `null` |
| `text.started` | `TextStarted` | `null` |
| `text.delta` | `Text` | `String` |
| `text.ended` | `TextEnded` | `null` |
| `tool.called` | `ToolCall` | `{ name, args, callID }` |
| `tool.started` | `ToolStarted` | `{ callID }` |
| `tool.success` | `ToolSuccess` | `{ name, result, callID }` |
| `tool.failed` | `ToolFailed` | `{ name, error, callID }` |
| `tool.ended` | `ToolEnded` | `{ callID }` |
| `step.started` | `StepStarted` | `null` |
| `step.ended` | `StepEnded` | `null` |
| — (end of session) | `Finished` | `null` |
| `error` / sidecar crash | `Error` | `{ message }` |
| — (token usage) | `Usage` | `{ tokens_input, tokens_output, tokens_reasoning }` |

The mapping lives in `packages/sidecar/src/index.ts`. Each line of stdout is deserialized as `AgentEvent` by Rust's `serde_json::from_str` and forwarded through Tauri's `Channel<AgentEvent>` to the frontend's `onEvent` callback in `App.tsx`.

### Go API Gateway (packages/gateway/)

The Go server provides:

- **`POST /login`** — OAuth2 client credentials auth, returns 5-minute JWT
- **`POST /v1/chat/completions`** — LLM proxy to DeepSeek (or any OpenAI-compatible endpoint), JWT-protected, SSE streaming
- **`POST /api/memory/search`** — Qdrant vector search: embeds the prompt, queries top-3 memories (similarity ≥ 0.70), returns matched experiences (prompt, git_diff, error_log, project_id)
- **`POST /api/memory/sync`** — Upserts a memory point into Qdrant (embedding + payload with git diff, error log, project info)
- **`GET /api/health`** — Health check with user_id

Auto-creates a Qdrant `memory` collection (1536-dim, Cosine distance) on startup. Embeddings via `text-embedding-3-small` (OpenAI) or mock vectors when using DeepSeek API base.

### Self-Healing Agent Pipeline (packages/client-cli/)

The `openhands run <task>` command implements a full C/S self-healing pipeline:

1. **Isolation**: Creates a git worktree sandbox at `/tmp/ai-workers/<taskId>` from branch `main`
2. **Memory Retrieval**: Fetches relevant past experiences from the Go gateway's Qdrant vector DB
3. **Agent Execution**: Spawns the **Hermes** agent (external CLI) to write code, with `.agents/config.yaml` routing rules applied
4. **Fast Validation**: Runs `fastValidate()` — matches modified files against config-driven verification rules (e.g., `cargo check` for Rust, `bun test` for TS, `go fmt` for Go)
5. **Self-Heal Loop**: If validation fails (up to 3 attempts), calls **OpenCode sidecar** as a CI healer to fix errors, then re-validates
6. **Commit & Cleanup**: On success, commits locally and removes the worktree. On failure, performs safe rollback (force-removes worktree and branch)

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
  primary_developer:
    model: "deepseek/deepseek-v4-flash"
    temperature: 0.2
  ci_healer:
    model: "deepseek/deepseek-v4-flash"
    temperature: 0.0
verification_pipeline:
  project_tauri:
    match: "src-tauri/**/*"
    cmd: "cargo check --manifest-path src-tauri/Cargo.toml"
```

Template rendering: `agent.md` files can use `{{project_id}}`, `{{components}}`, `{{tech_rules}}` placeholders that the CLI pipeline resolves before spawning agents.

### Sidecar Build Chain

The sidecar is compiled from TypeScript to a native binary:
```
packages/sidecar/src/index.ts → bun build --compile → apps/desktop/src-tauri/binaries/opencode-sidecar-<target-triple>
```
- The binary name must include the Rust target triple suffix (e.g., `opencode-sidecar-aarch64-apple-darwin`)
- Requires `../opencode` project directory to exist (the `@opencode/core` package dependency at `../opencode/packages/core/`)
- Binary is tracked via **Git LFS** (`.gitattributes` configured)
- If `../opencode` is absent, `build:sidecar` gracefully skips the build

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

- **`tauri.conf.json`**: Window set to 1280×600 with `titleBarStyle: "Overlay"` and `hiddenTitle: true` for custom titlebar. Sidecar binary registered under `bundle.externalBin`. Security CSP set to `null` (permissive).
- **`capabilities/default.json`**: SQLite plugin permissions for `deepseek_code.db`, window drag, and opener plugin.

## Conventions

- **Language**: All implementation plans, code comments, and in-app text must be in Chinese
- After feature development: run `bun run test` (cargo check + bun test), update `docs/route-map.md` if new components/routes/commands were added
- Prefer `bun run dev:desktop` for UI work (fast iteration in browser without Rust compilation)
- **Sidecar tip**: To rebuild the sidecar binary during development, run `bun run build:sidecar` — otherwise `bun run dev:desktop` does it automatically on start
- **Git LFS**: Binaries in `apps/desktop/src-tauri/binaries/` are tracked with Git LFS. Run `git lfs pull` after cloning to get the sidecar binary.
- **Rust tools directory**: `src-tauri/src/` may have `tools/` (file_read, file_write, file_edit, grep, glob, bash) and `safety.rs` (path jail) — these are planned but not yet implemented in the current codebase. Check existence before referencing.
