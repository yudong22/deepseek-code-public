# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`deepseek-code` is a local AI programming assistant desktop app (Tauri v2 + React 19 + TypeScript) powered by DeepSeek-V4. The Rust backend provides an agent loop with 6 file/code tools, streaming results to the React frontend via Tauri Channels.

## Development Commands

```bash
bun install                  # Install frontend dependencies
bun run dev                  # Web mode (browser, mock backend, no Rust) — use for UI iteration
bun run tauri dev            # Full desktop mode (Tauri + Rust backend + SQLite)
bun run test                 # Run all checks: cargo check + bun test
bun run tauri build          # Production build
bun run build:mac            # Build macOS .app, kill old instance, copy to /Applications
```

## Architecture

### Dual-Environment Bridge Pattern

The frontend never calls Tauri APIs directly. All backend communication goes through `src/bridge/`, which detects the runtime environment and routes to the correct implementation:

- **`src/bridge/types.ts`** — `IBridge` interface defining the full API contract
- **`src/bridge/index.ts`** — Facade: checks `window.__TAURI_INTERNALS__` to select Tauri or mock
- **`src/bridge/tauri.ts`** — Tauri implementation: SQLite via `tauri-plugin-sql`, agent via `invoke("run_agent_loop", ...)` with a `Channel<AgentEvent>` for streaming
- **`src/bridge/mock.ts`** — Browser fallback: localStorage for persistence, simulated agent events

### Agent Loop (Rust Backend)

The core is `run_agent_loop` in `src-tauri/src/lib.rs:30` — a Tauri async command that:

1. Receives API key, model name, message history, workspace root, and sessionId
2. Locates and spawns the external sidecar binary `opencode-sidecar` (configured in `tauri.conf.json`)
3. Passes key, model, workspace, and session ID to the sidecar as environment variables
4. Writes the last user prompt to the sidecar's `stdin` and closes it
5. Reads the sidecar's `stdout` stream line-by-line: parses JSON `AgentEvent`s and streams them to the frontend via `Channel<AgentEvent>`
6. Checks the exit code of the sidecar process, and forwards error logs from `stderr` if the execution failed


### 6 Built-in Tools (`src-tauri/src/tools/`)

All tools implement the `AgentTool` trait (`mod.rs`): `name()`, `description()`, `parameters()`, `call(args)`.

| Tool | File | Key Behavior |
|------|------|--------------|
| FileRead | `file_read.rs` | Read file with optional line range + page formatting |
| FileWrite | `file_write.rs` | Create new file only (prevents overwrite) |
| FileEdit | `file_edit.rs` | Single exact-match string replacement |
| Grep | `grep.rs` | Regex search respecting `.gitignore` via `ignore` crate |
| Glob | `glob.rs` | File pattern matching respecting `.gitignore` |
| Bash | `bash.rs` | Async command execution in workspace root |

### Path Safety (`src-tauri/src/safety.rs`)

`validate_path(workspace_root, target_path)` canonicalizes both paths and rejects any target that escapes the workspace root. Applied in FileRead, FileWrite, and FileEdit. Grep/Glob restrict search to the workspace root. Bash sets `cwd` to the workspace root.

### Frontend (`src/`)

- **Single-component architecture**: `App.tsx` (~1360 lines) contains the entire UI — `MainDashboard` component with custom titlebar, dual collapsible sidebars, chat panel, Mermaid rendering, settings modal, and toast notifications
- **Routing**: HashRouter with 2 routes — `/` (new conversation) and `/chat/s/:id` (active session); both render `MainDashboard`
- **Custom markdown renderer**: Hand-written parser for headers, lists, code blocks, inline formatting, and ` ```mermaid` blocks (rendered with the `mermaid` library)
- **State management**: Plain React `useState`/`useRef` — no external library

### Default Workspace

`backend/sandbox_workspace/` — the default sandbox directory for agent file operations when no explicit workspace root is provided.

### Database Schema (SQLite: `deepseek_code.db`)

- `sessions(id TEXT PK, title TEXT, lastMessage TEXT, updatedAt TEXT, projectName TEXT)`
- `messages(id TEXT PK, sessionId TEXT, role TEXT, content TEXT, createdAt TEXT, reasoningContent TEXT, filesChanged TEXT, artifacts TEXT, toolCalls TEXT)`
- `settings(key TEXT PK, value TEXT)` — used primarily for API key storage

## Conventions

- **Language**: All implementation plans, code comments, and in-app text must be in Chinese
- After feature development: run `bun run test` (cargo check + bun test), update `docs/route-map.md` if new components/routes/commands were added
- Prefer `bun run dev` for UI work (fast iteration in browser without Rust compilation)
