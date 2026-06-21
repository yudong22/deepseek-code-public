//! Session management: SQLite database for session tracking and token usage.
//!
//! Mirrors the `.opencode/opencode.db` schema used by the TypeScript sidecar.

use rusqlite::{Connection, params};
use std::path::PathBuf;

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
