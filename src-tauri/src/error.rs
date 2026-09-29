use serde::Serialize;
use serde_json::Value;

/// Only safe, actionable messages cross the webview boundary. Never serialize
/// a reqwest/keyring error: those may contain headers or platform internals.
#[derive(Debug, Serialize)]
pub struct AppError {
    pub kind: &'static str,
    pub message: String,
    pub status: Option<u16>,
    pub details: Option<Value>,
    pub latency_ms: Option<u64>,
}

impl AppError {
    pub fn new(kind: &'static str, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            status: None,
            details: None,
            latency_ms: None,
        }
    }

    pub fn storage() -> Self {
        Self::new(
            "storage",
            "The local database could not be read or written.",
        )
    }
}

pub type AppResult<T> = Result<T, AppError>;
