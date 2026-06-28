//! sidecar-agent: Rust-native agent loop replacing the Bun sidecar binary.
//!
//! This crate reimplements the opencode agent loop in Rust, producing
//! the same 17 AgentEvent types as the TypeScript sidecar (bit-identical JSON).
//!
//! ## Module Map
//!
//! - `protocol` — stdin parsing, AgentEvent enum, serialization (Phase 1)
//! - `provider` — LLM provider config, SSE streaming (Phase 2)
//! - `tools`    — Tool trait + 7 tool implementations (Phase 3)
//! - `agent`    — main agent loop (Phase 4)
//! - `session`  — SQLite session management (Phase 5)

pub mod protocol;
pub mod provider;
pub mod tools;
pub mod agent;
pub mod session;
pub mod safety;
