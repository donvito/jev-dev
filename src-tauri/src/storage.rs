use std::{collections::BTreeMap, path::Path, sync::Mutex, time::Duration};

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::error::{AppError, AppResult};

pub struct Database(Mutex<Connection>);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RunStatus {
    Success,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum RunSource {
    Live,
    Demo,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Run {
    pub id: String,
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub name: String,
    pub request_json: Value,
    pub response_json: Option<Value>,
    pub requested_model: String,
    pub resolved_model: Option<String>,
    pub latency_ms: u64,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub status: RunStatus,
    pub error_json: Option<Value>,
    pub created_at: String,
    pub source: RunSource,
    /// Preserve extra metadata as the frontend evolves without losing history.
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Database {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        Self::initialize(Connection::open(path)?)
    }

    fn initialize(connection: Connection) -> rusqlite::Result<Self> {
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS workspace (
                 singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                 data_json TEXT NOT NULL CHECK (json_valid(data_json)),
                 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             );
             CREATE TABLE IF NOT EXISTS runs (
                 id TEXT PRIMARY KEY NOT NULL,
                 project_id TEXT,
                 session_id TEXT,
                 created_at TEXT NOT NULL,
                 status TEXT NOT NULL CHECK (status IN ('success', 'error')),
                 source TEXT NOT NULL CHECK (source IN ('live', 'demo')),
                 run_json TEXT NOT NULL CHECK (json_valid(run_json))
             );
             CREATE INDEX IF NOT EXISTS runs_created_at ON runs(created_at DESC);
             CREATE INDEX IF NOT EXISTS runs_project ON runs(project_id, created_at DESC);
             CREATE TRIGGER IF NOT EXISTS runs_immutable_update
                 BEFORE UPDATE ON runs BEGIN
                 SELECT RAISE(ABORT, 'Run history is immutable');
             END;
             CREATE TRIGGER IF NOT EXISTS runs_immutable_delete
                 BEFORE DELETE ON runs BEGIN
                 SELECT RAISE(ABORT, 'Run history is immutable');
             END;
             PRAGMA user_version = 1;",
        )?;
        Ok(Self(Mutex::new(connection)))
    }

    pub fn load_workspace(&self) -> AppResult<Option<Value>> {
        let connection = self.0.lock().map_err(|_| AppError::storage())?;
        let json: Option<String> = connection
            .query_row(
                "SELECT data_json FROM workspace WHERE singleton = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|_| AppError::storage())?;
        json.map(|json| serde_json::from_str(&json).map_err(|_| AppError::storage()))
            .transpose()
    }

    pub fn save_workspace(&self, workspace: Value) -> AppResult<()> {
        if !workspace.is_object() {
            return Err(AppError::new(
                "validation",
                "Workspace data must be a JSON object.",
            ));
        }
        let json = serde_json::to_string(&workspace).map_err(|_| AppError::storage())?;
        self.0
            .lock()
            .map_err(|_| AppError::storage())?
            .execute(
                "INSERT INTO workspace(singleton, data_json) VALUES (1, ?1)
                 ON CONFLICT(singleton) DO UPDATE SET data_json = excluded.data_json,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
                [json],
            )
            .map_err(|_| AppError::storage())?;
        Ok(())
    }

    pub fn list_runs(&self) -> AppResult<Vec<Run>> {
        let connection = self.0.lock().map_err(|_| AppError::storage())?;
        let mut statement = connection
            .prepare("SELECT run_json FROM runs ORDER BY created_at DESC, rowid DESC")
            .map_err(|_| AppError::storage())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|_| AppError::storage())?;
        rows.map(|row| {
            let raw = row.map_err(|_| AppError::storage())?;
            serde_json::from_str(&raw).map_err(|_| AppError::storage())
        })
        .collect()
    }

    pub fn save_run(&self, run: Run) -> AppResult<()> {
        if run.id.trim().is_empty()
            || run.created_at.trim().is_empty()
            || run.requested_model.trim().is_empty()
            || !run.request_json.is_object()
        {
            return Err(AppError::new(
                "validation",
                "A run needs an ID, timestamp, model, and request object.",
            ));
        }
        match run.status {
            RunStatus::Success if !run.response_json.as_ref().is_some_and(Value::is_object) => {
                return Err(AppError::new(
                    "validation",
                    "A successful run needs its complete response object.",
                ));
            }
            RunStatus::Error if !run.error_json.as_ref().is_some_and(Value::is_object) => {
                return Err(AppError::new(
                    "validation",
                    "A failed run needs its error details.",
                ));
            }
            _ => {}
        }
        let raw = serde_json::to_string(&run).map_err(|_| AppError::storage())?;
        let status = match run.status {
            RunStatus::Success => "success",
            RunStatus::Error => "error",
        };
        let source = match run.source {
            RunSource::Live => "live",
            RunSource::Demo => "demo",
        };
        let connection = self.0.lock().map_err(|_| AppError::storage())?;
        let result = connection.execute(
            "INSERT INTO runs(id, project_id, session_id, created_at, status, source, run_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                run.id,
                run.project_id,
                run.session_id,
                run.created_at,
                status,
                source,
                raw
            ],
        );
        match result {
            Ok(_) => Ok(()),
            Err(rusqlite::Error::SqliteFailure(error, _))
                if error.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_PRIMARYKEY =>
            {
                Err(AppError::new(
                    "duplicate_run",
                    "This run already exists. Run snapshots cannot be overwritten.",
                ))
            }
            Err(_) => Err(AppError::storage()),
        }
    }
}

#[tauri::command]
pub fn load_workspace(database: State<'_, Database>) -> AppResult<Option<Value>> {
    database.load_workspace()
}

#[tauri::command]
pub fn save_workspace(database: State<'_, Database>, workspace: Value) -> AppResult<()> {
    database.save_workspace(workspace)
}

#[tauri::command]
pub fn list_runs(database: State<'_, Database>) -> AppResult<Vec<Run>> {
    database.list_runs()
}

#[tauri::command]
pub fn save_run(database: State<'_, Database>, run: Run) -> AppResult<()> {
    database.save_run(run)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn sample_run() -> Run {
        serde_json::from_value(json!({
            "id":"immutable-run", "session_id":"session", "project_id":"project",
            "name":"Resume screening", "request_json":{"state":{"resume":"Engineer"}, "model":"jev-latest", "questions":{}},
            "response_json":{"model":"jev-1.13.0", "answers":{}, "future_provider_field":{"keep":[1,2,3]}},
            "requested_model":"jev-latest", "resolved_model":"jev-1.13.0", "latency_ms":321,
            "input_tokens":42, "output_tokens":12, "status":"success", "error_json":null,
            "created_at":"2026-09-29T10:00:00Z", "source":"live", "future_metadata":"preserve"
        })).unwrap()
    }

    #[test]
    fn persistence_survives_reopening_and_preserves_raw_json() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("jev-agent.sqlite3");
        let workspace = json!({"projects":[{"name":"Jev"}],"dataset":{"state":["a",{"b":true}]}});
        let run = sample_run();
        {
            let db = Database::open(&path).unwrap();
            assert_eq!(db.load_workspace().unwrap(), None);
            db.save_workspace(workspace.clone()).unwrap();
            db.save_run(run.clone()).unwrap();
        }
        let db = Database::open(&path).unwrap();
        assert_eq!(db.load_workspace().unwrap(), Some(workspace));
        assert_eq!(db.list_runs().unwrap(), vec![run]);
    }

    #[test]
    fn immutable_history_rejects_duplicate_update_and_delete() {
        let db = Database::initialize(Connection::open_in_memory().unwrap()).unwrap();
        let original = sample_run();
        db.save_run(original.clone()).unwrap();
        let mut replacement = original.clone();
        replacement.response_json = Some(json!({"tampered":true}));
        assert_eq!(db.save_run(replacement).unwrap_err().kind, "duplicate_run");
        {
            let connection = db.0.lock().unwrap();
            assert!(connection
                .execute("UPDATE runs SET run_json = '{}'", [])
                .is_err());
            assert!(connection.execute("DELETE FROM runs", []).is_err());
        }
        assert_eq!(db.list_runs().unwrap(), vec![original]);
    }

    #[test]
    fn errors_are_recorded_with_raw_request_and_error() {
        let db = Database::initialize(Connection::open_in_memory().unwrap()).unwrap();
        let mut run = sample_run();
        run.status = RunStatus::Error;
        run.response_json = None;
        run.resolved_model = None;
        run.error_json = Some(
            json!({"kind":"http", "status":422, "details":{"detail":[{"loc":["body","questions"]}]}}),
        );
        db.save_run(run.clone()).unwrap();
        assert_eq!(db.list_runs().unwrap(), vec![run]);
    }
}
