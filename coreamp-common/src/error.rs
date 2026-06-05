//! Structured error type for the CoreAmp common crate.
//!
//! Internal code returns `Result<T, CoreampError>` so the source error (a
//! `rusqlite::Error`, an `io::Error`, a poisoned lock, …) is preserved instead
//! of being flattened to a string at every call site. `From<CoreampError> for
//! String` keeps the Tauri IPC boundary (which serialises errors as strings)
//! working with a plain `?`.

#[derive(Debug, thiserror::Error)]
pub enum CoreampError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    /// A `Mutex` guarding the shared DB connection was poisoned by a panic in
    /// another thread.
    #[error("database lock was poisoned")]
    Lock,

    /// A contextual message that doesn't map onto a typed source error.
    #[error("{0}")]
    Message(String),
}

impl From<String> for CoreampError {
    fn from(value: String) -> Self {
        CoreampError::Message(value)
    }
}

impl From<&str> for CoreampError {
    fn from(value: &str) -> Self {
        CoreampError::Message(value.to_string())
    }
}

// Flatten back to a string at the IPC boundary so Tauri commands (which return
// `Result<_, String>`) can propagate a `CoreampError` with `?`.
impl From<CoreampError> for String {
    fn from(value: CoreampError) -> Self {
        value.to_string()
    }
}
