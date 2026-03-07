use crate::config_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::fs::OpenOptions;
use std::io::ErrorKind;
use std::io::Write;
use std::time::{SystemTime, UNIX_EPOCH};

const EVENTS_FILENAME: &str = "daemon-events.jsonl";
const SEQUENCE_FILENAME: &str = "daemon-events.seq";
const MAX_PERSISTED_EVENTS: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonEvent {
    pub id: u64,
    pub timestamp_ms: u64,
    pub event: String,
    pub message: String,
    pub roots_scanned: Option<usize>,
    pub files_discovered: Option<usize>,
    pub files_upserted: Option<usize>,
    pub enriched: Option<usize>,
    pub interval_secs: Option<u64>,
}

impl DaemonEvent {
    pub fn new(event: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            id: 0,
            timestamp_ms: 0,
            event: event.into(),
            message: message.into(),
            roots_scanned: None,
            files_discovered: None,
            files_upserted: None,
            enriched: None,
            interval_secs: None,
        }
    }
}

fn ipc_dir() -> std::path::PathBuf {
    config_dir().join("ipc")
}

fn events_path() -> std::path::PathBuf {
    ipc_dir().join(EVENTS_FILENAME)
}

fn sequence_path() -> std::path::PathBuf {
    ipc_dir().join(SEQUENCE_FILENAME)
}

fn ensure_ipc_dir() -> Result<(), String> {
    fs::create_dir_all(ipc_dir()).map_err(|err| err.to_string())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn next_event_id() -> Result<u64, String> {
    let path = sequence_path();
    let current = match fs::read_to_string(&path) {
        Ok(raw) => raw.trim().parse::<u64>().unwrap_or(0),
        Err(err) if err.kind() == ErrorKind::NotFound => 0,
        Err(err) => return Err(err.to_string()),
    };
    let next = current.saturating_add(1);
    fs::write(path, next.to_string()).map_err(|err| err.to_string())?;
    Ok(next)
}

fn trim_events_file() -> Result<(), String> {
    let path = events_path();
    let raw = match fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(err.to_string()),
    };

    let lines = raw
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect::<Vec<_>>();
    if lines.len() <= MAX_PERSISTED_EVENTS {
        return Ok(());
    }

    let keep_from = lines.len() - MAX_PERSISTED_EVENTS;
    let mut trimmed = lines[keep_from..].join("\n");
    trimmed.push('\n');
    fs::write(path, trimmed).map_err(|err| err.to_string())
}

pub fn publish_daemon_event(mut event: DaemonEvent) -> Result<DaemonEvent, String> {
    ensure_ipc_dir()?;
    event.id = next_event_id()?;
    event.timestamp_ms = now_ms();

    let line = serde_json::to_string(&event).map_err(|err| err.to_string())?;
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(events_path())
        .map_err(|err| err.to_string())?;
    writeln!(file, "{line}").map_err(|err| err.to_string())?;
    trim_events_file()?;
    Ok(event)
}

pub fn read_daemon_events(
    since_id: Option<u64>,
    limit: Option<usize>,
) -> Result<Vec<DaemonEvent>, String> {
    let raw = match fs::read_to_string(events_path()) {
        Ok(raw) => raw,
        Err(err) if err.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(err.to_string()),
    };

    let threshold = since_id.unwrap_or(0);
    let mut events = raw
        .lines()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| serde_json::from_str::<DaemonEvent>(line).ok())
        .filter(|event| event.id > threshold)
        .collect::<Vec<_>>();

    if let Some(limit) = limit
        && events.len() > limit
    {
        let keep_from = events.len() - limit;
        events = events.split_off(keep_from);
    }

    Ok(events)
}
