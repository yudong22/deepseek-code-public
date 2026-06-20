# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`deepseek-code` is a local AI programming assistant desktop app (Tauri v2 + React 19 + TypeScript) powered by DeepSeek-V4. The Rust backend spawns an external sidecar process (`opencode-sidecar`) that runs the actual agent loop with 6 file/code tools, streaming results to the React frontend via Tauri Channels.

## Development Commands

```bash
bun install                  # Install frontend dependencies
bun run dev                  # Web mode (browser, mock backend, no Rust) — use for UI iteration
bun run tauri dev            # Full desktop mode (Tauri + Rust backend + SQLite)
bun run test                 # Run all checks: cargo check + bun test
bun run tauri build          # Production build
bun run build:mac            # Build macOS .app, kill old instance, copy to /Applications
bun run build:sidecar        # Compile the sidecar binary from src-sidecar/index.ts
bun test                     # Run only frontend unit tests (Bun test runner)
cargo check --manifest-path src-tauri/Cargo.toml  # Rust compilation check only
```

## Architecture

### Dual-Environment Bridge Pattern

The frontend never calls Tauri APIs directly. All backend communication goes through `src/bridge/`, which detects the runtime environment and routes to the correct implementation:

- **`src/bridge/types.ts`** — `IBridge` interface defining the full API contract
- **`src/bridge/index.ts`** — Facade: checks `window.__TAURI_INTERNALS__` to select Tauri or mock
- **`src/bridge/tauri.ts`** — Tauri implementation: SQLite via `tauri-plugin-sql`, agent via `invoke("run_agent_loop", ...)` with a `Channel<AgentEvent>` for streaming
- **`src/bridge/mock.ts`** — Browser fallback: localStorage for persistence, simulated agent events
- **`src/bridge/bridge.test.ts`** — Unit tests for mock bridge (Bun test runner, `describe`/`test`/`expect`)

### Sidecar Agent Loop (Key Architecture Piece)

The core agent loop runs **outside** the Tauri Rust backend, in an external sidecar process (`opencode-sidecar`) that wraps the `opencode` package:

1. **`src-tauri/src/lib.rs:run_agent_loop`** — Tauri async command that:
   - Receives API key, model name, message history, workspace root, and sessionId
   - Locates and spawns the external sidecar binary `opencode-sidecar` (configured in `tauri.conf.json` as `externalBin`)
   - Passes `DEEPSEEK_API_KEY`, `OPENCODE_MODEL`, `WORKSPACE_PATH`, `OPENCODE_SESSION_ID` as environment variables
   - Writes the last user prompt to the sidecar's `stdin` and closes it
   - Reads the sidecar's `stdout` stream line-by-line: parses JSON `AgentEvent`s and streams them to the frontend via `Channel<AgentEvent>`
   - Checks the exit code of the sidecar process, and forwards error logs from `stderr` if execution failed

2. **`src-sidecar/index.ts`** — The actual agent entry point, compiled into a standalone binary via `bun build --compile`:
   - Imports `Session` from the external `opencode` package (at `../opencode/packages/core/`)
   - Maps DeepSeek/OpenAI/Anthropic/Google provider IDs from the model string
   - Calls `session.prompt(prompt, callback)` which drives the full agent loop

### Agent Event Lifecycle (opencode ↔ deepseek-code)

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

The mapping lives in `src-sidecar/index.ts`. Each line of the sidecar's stdout is deserialized as `AgentEvent` by Rust's `serde_json::from_str` and forwarded through Tauri's `Channel<AgentEvent>` to the frontend's `onEvent` callback in `src/App.tsx:504`.

3. **`.opencode/`** — Local data directory for the sidecar's persistent state (`opencode.db` SQLite database, `opencode.json` configuration with provider definitions)

### Sidecar Build Chain

The sidecar is compiled from TypeScript to a native binary using `bun build --compile`:
```
bun build --compile --minify src-sidecar/index.ts --outfile src-tauri/binaries/opencode-sidecar-$(rustc -Vv | grep host | cut -d ' ' -f 2)
```
- The binary name must include the Rust target triple suffix (e.g., `opencode-sidecar-aarch64-apple-darwin`)
- Requires `../opencode` project directory to exist (the `@opencode/core` package dependency)
- Binary is tracked via **Git LFS** (`.gitattributes` configured)
- If `../opencode` is absent, `build:sidecar` gracefully skips the build

### Agent Loop (Rust Backend)

The core is `run_agent_loop` in `src-tauri/src/lib.rs` — a Tauri async command that:

1. Receives API key, model name, message history, workspace root, and sessionId
2. Locates and spawns the external sidecar binary `opencode-sidecar` (configured in `tauri.conf.json`)
3. Passes key, model, workspace, and session ID to the sidecar as environment variables
4. Writes the last user prompt to the sidecar's `stdin` and closes it
5. Reads the sidecar's `stdout` stream line-by-line: parses JSON `AgentEvent`s and streams them to the frontend via `Channel<AgentEvent>`
6. Checks the exit code of the sidecar process, and forwards error logs from `stderr` if the execution failed

### Frontend (`src/`)

- **Single-page architecture**: `App.tsx` (~793 lines) contains the entire UI state — `MainDashboard` component with custom titlebar, dual collapsible sidebars, chat panel, Mermaid rendering, settings modal, and toast notifications
- **Components** (`src/components/`): 11 components — `ChatFeed`, `ChatInput`, `EmptyState`, `Icons`, `LeftSidebar`, `Mermaid`, `RightPanel`, `SettingsModal`, `TitleBar`, `Toast`, `ToolCallCard`
- **Routing**: HashRouter with 2 routes — `/` (new conversation, renders `EmptyState`) and `/chat/s/:id` (active session, renders `MainDashboard`)
- **Custom markdown renderer**: `src/utils/markdown.tsx` — hand-written parser for headers (h3 only), lists, code blocks, inline formatting, tables, and ` ```mermaid ` blocks (rendered with the `mermaid` library)
- **State management**: Plain React `useState`/`useRef` — no external library
- **Alias**: `@/` maps to `src/` via Vite `resolve.alias`

### Default Workspace

`backend/sandbox_workspace/` — the default sandbox directory for agent file operations when no explicit workspace root is provided. In Tauri mode, falls back to `<app_data_dir>/sandbox_workspace/`.

### Database Schema (SQLite: `deepseek_code.db`)

- `sessions(id TEXT PK, title TEXT, lastMessage TEXT, updatedAt TEXT, projectName TEXT)`
- `messages(id TEXT PK, sessionId TEXT, role TEXT, content TEXT, createdAt TEXT, reasoningContent TEXT, filesChanged TEXT, artifacts TEXT, toolCalls TEXT)`
- `settings(key TEXT PK, value TEXT)` — used for API key, workspace path, and projects list

### CI/CD

- **`release-mac.yml`**: GitHub Actions workflow for macOS builds. Triggered on `v*` tags or manually. Builds for `aarch64-apple-darwin` using `tauri-apps/tauri-action`, supports Apple code signing/notarization via secrets.

### Tauri Configuration

- **`tauri.conf.json`**: Window set to 1280×600 with `titleBarStyle: "Overlay"` and `hiddenTitle: true` for custom titlebar. Sidecar binary registered under `bundle.externalBin`. Security CSP set to `null` (permissive).
- **`capabilities/default.json`**: SQLite plugin permissions for `deepseek_code.db`, window drag, and opener plugin.

## Conventions

- **Language**: All implementation plans, code comments, and in-app text must be in Chinese
- After feature development: run `bun run test` (cargo check + bun test), update `docs/route-map.md` if new components/routes/commands were added
- Prefer `bun run dev` for UI work (fast iteration in browser without Rust compilation)
- **Sidecar tip**: To rebuild the sidecar binary during development, run `bun run build:sidecar` — otherwise `bun run dev` does it automatically on start
- **Git LFS**: Binaries in `src-tauri/binaries/` are tracked with Git LFS. Run `git lfs pull` after cloning to get the sidecar binary.
