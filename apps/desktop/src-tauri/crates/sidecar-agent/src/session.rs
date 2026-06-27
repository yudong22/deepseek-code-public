//! Session management: SQLite database for session tracking and token usage.
//!
//! Mirrors the `.opencode/opencode.db` schema used by the TypeScript sidecar.

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents a scheduled task stored in scheduled_tasks table.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub workspace_root: String,
    #[serde(default)]
    pub cron_expr: String, // v0.5.8 简化：用 interval_seconds，cron 留 v0.6.0
    pub interval_seconds: i64,
    pub next_run_at: String,
    pub enabled: bool,
    pub created_at: String,
    pub last_run_at: Option<String>,
    pub last_status: Option<String>,
}

/// Manages the SQLite session database at `.opencode/opencode.db`.
pub struct SessionStore {
    db_path: PathBuf,
    session_id: String,
}

impl SessionStore {
    /// Create a new session store.
    pub fn new(opencode_dir: PathBuf, session_id: &str) -> Self {
        Self {
            db_path: opencode_dir.join("opencode.db"),
            session_id: session_id.to_string(),
        }
    }

    /// Initialize database tables if they don't exist.
    pub fn init_tables(&self) -> Result<(), rusqlite::Error> {
        // Ensure directory exists
        if let Some(parent) = self.db_path.parent() {
            std::fs::create_dir_all(parent).ok();
        }

        let conn = Connection::open(&self.db_path)?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                tokens_input INTEGER DEFAULT 0,
                tokens_output INTEGER DEFAULT 0,
                tokens_reasoning INTEGER DEFAULT 0,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                role TEXT,
                content TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                type TEXT,
                data TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS scheduled_tasks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                prompt TEXT NOT NULL,
                workspace_root TEXT NOT NULL,
                cron_expr TEXT DEFAULT '',
                interval_seconds INTEGER NOT NULL,
                next_run_at TEXT NOT NULL,
                enabled INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                last_run_at TEXT,
                last_status TEXT
            );"
        )?;

        Ok(())
    }

    /// Create a session record.
    pub fn create_session(&self) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "INSERT OR IGNORE INTO sessions (id) VALUES (?1)",
            params![self.session_id],
        )?;
        Ok(())
    }

    /// Update token usage for the session.
    pub fn update_usage(
        &self,
        tokens_input: i64,
        tokens_output: i64,
        tokens_reasoning: i64,
    ) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "UPDATE sessions SET tokens_input = ?1, tokens_output = ?2, tokens_reasoning = ?3 WHERE id = ?4",
            params![tokens_input, tokens_output, tokens_reasoning, self.session_id],
        )?;
        Ok(())
    }

    /// Read token usage from the database.
    pub fn read_usage(&self) -> Result<(i64, i64, i64), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        let mut stmt = conn.prepare(
            "SELECT tokens_input, tokens_output, tokens_reasoning FROM sessions WHERE id = ?1"
        )?;
        let result = stmt.query_row(params![self.session_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        });

        match result {
            Ok(row) => Ok(row),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok((0, 0, 0)),
            Err(e) => Err(e),
        }
    }

    // ── Scheduled Task CRUD ──

    /// List all scheduled tasks, ordered by created_at.
    pub fn list_scheduled_tasks(&self) -> Result<Vec<ScheduledTask>, rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        let mut stmt = conn.prepare(
            "SELECT id, name, prompt, workspace_root, cron_expr, interval_seconds,
                    next_run_at, enabled, created_at, last_run_at, last_status
             FROM scheduled_tasks ORDER BY created_at DESC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ScheduledTask {
                id: row.get(0)?,
                name: row.get(1)?,
                prompt: row.get(2)?,
                workspace_root: row.get(3)?,
                cron_expr: row.get(4)?,
                interval_seconds: row.get(5)?,
                next_run_at: row.get(6)?,
                enabled: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_run_at: row.get(9)?,
                last_status: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    /// Create a scheduled task.
    pub fn create_scheduled_task(&self, task: &ScheduledTask) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "INSERT INTO scheduled_tasks (id, name, prompt, workspace_root, cron_expr, interval_seconds, next_run_at, enabled, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))",
            params![
                task.id, task.name, task.prompt, task.workspace_root,
                task.cron_expr, task.interval_seconds, task.next_run_at,
                task.enabled as i32,
            ],
        )?;
        Ok(())
    }

    /// Update a scheduled task.
    pub fn update_scheduled_task(&self, task: &ScheduledTask) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "UPDATE scheduled_tasks SET name=?1, prompt=?2, workspace_root=?3, cron_expr=?4,
                    interval_seconds=?5, next_run_at=?6, enabled=?7, last_run_at=?8, last_status=?9
             WHERE id=?10",
            params![
                task.name, task.prompt, task.workspace_root, task.cron_expr,
                task.interval_seconds, task.next_run_at, task.enabled as i32,
                task.last_run_at, task.last_status, task.id,
            ],
        )?;
        Ok(())
    }

    /// Delete a scheduled task by id.
    pub fn delete_scheduled_task(&self, id: &str) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute("DELETE FROM scheduled_tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Toggle enabled status of a scheduled task.
    pub fn toggle_scheduled_task(&self, id: &str, enabled: bool) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "UPDATE scheduled_tasks SET enabled = ?1 WHERE id = ?2",
            params![enabled as i32, id],
        )?;
        Ok(())
    }

    /// Fetch tasks that are due to run (next_run_at <= now, enabled).
    pub fn get_due_tasks(&self) -> Result<Vec<ScheduledTask>, rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        let mut stmt = conn.prepare(
            "SELECT id, name, prompt, workspace_root, cron_expr, interval_seconds,
                    next_run_at, enabled, created_at, last_run_at, last_status
             FROM scheduled_tasks
             WHERE enabled = 1 AND next_run_at <= datetime('now')
             ORDER BY next_run_at ASC"
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ScheduledTask {
                id: row.get(0)?,
                name: row.get(1)?,
                prompt: row.get(2)?,
                workspace_root: row.get(3)?,
                cron_expr: row.get(4)?,
                interval_seconds: row.get(5)?,
                next_run_at: row.get(6)?,
                enabled: row.get::<_, i32>(7)? != 0,
                created_at: row.get(8)?,
                last_run_at: row.get(9)?,
                last_status: row.get(10)?,
            })
        })?;
        rows.collect()
    }

    /// Mark a task as completed and schedule its next run.
    pub fn complete_scheduled_task(&self, id: &str, status: &str) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        conn.execute(
            "UPDATE scheduled_tasks SET last_run_at = datetime('now'), last_status = ?1,
                    next_run_at = datetime('now', '+' || (SELECT interval_seconds FROM scheduled_tasks WHERE id = ?2) || ' seconds')
             WHERE id = ?2",
            params![status, id],
        )?;
        Ok(())
    }

    /// Clean up plan mode temporary session data.
    pub fn cleanup_plan_mode(&self) -> Result<(), rusqlite::Error> {
        let conn = Connection::open(&self.db_path)?;
        // Delete events, messages, and session for plan mode
        conn.execute(
            "DELETE FROM events WHERE session_id = ?1",
            params![self.session_id],
        )?;
        conn.execute(
            "DELETE FROM messages WHERE session_id = ?1",
            params![self.session_id],
        )?;
        conn.execute(
            "DELETE FROM sessions WHERE id = ?1",
            params![self.session_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_crud() {
        let tmp = tempfile::tempdir().unwrap();
        let store = SessionStore::new(tmp.path().to_path_buf(), "ses_test123");

        store.init_tables().unwrap();
        store.create_session().unwrap();

        // Update usage
        store.update_usage(100, 50, 200).unwrap();

        // Read back
        let (input, output, reasoning) = store.read_usage().unwrap();
        assert_eq!(input, 100);
        assert_eq!(output, 50);
        assert_eq!(reasoning, 200);
    }

    #[test]
    fn session_not_found_returns_zeros() {
        let tmp = tempfile::tempdir().unwrap();
        let store = SessionStore::new(tmp.path().to_path_buf(), "ses_nonexistent");
        store.init_tables().unwrap();

        let (input, output, reasoning) = store.read_usage().unwrap();
        assert_eq!(input, 0);
        assert_eq!(output, 0);
        assert_eq!(reasoning, 0);
    }

    #[test]
    fn cleanup_plan_mode() {
        let tmp = tempfile::tempdir().unwrap();
        let store = SessionStore::new(tmp.path().to_path_buf(), "ses_xxx--plan");

        store.init_tables().unwrap();
        store.create_session().unwrap();
        store.update_usage(10, 20, 30).unwrap();

        // Verify data exists
        let (i, o, r) = store.read_usage().unwrap();
        assert!(i > 0);
        assert!(o > 0);
        assert!(r > 0);

        // Clean up
        store.cleanup_plan_mode().unwrap();

        // Data should be gone
        let (i, o, r) = store.read_usage().unwrap();
        assert_eq!(i, 0);
        assert_eq!(o, 0);
        assert_eq!(r, 0);
    }
}
