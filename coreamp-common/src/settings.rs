use crate::config_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub scan_interval_secs: u64,
    pub api_proxy: Option<String>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            scan_interval_secs: 5 * 60,
            api_proxy: None,
        }
    }
}

pub fn settings_path() -> PathBuf {
    config_dir().join("settings.json")
}

/// Atomic write path: serialize to a sibling `.tmp` file, then
/// `fs::rename` onto the destination. `rename` is atomic on the same
/// filesystem on every platform we ship to, so a crash mid-write
/// leaves either the old file (untouched) or the new one (complete).
pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(config_dir()).map_err(|err| err.to_string())?;
    let dest = settings_path();
    let tmp = dest.with_extension("json.tmp");
    let content = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(&tmp, content).map_err(|err| err.to_string())?;
    fs::rename(&tmp, &dest).map_err(|err| err.to_string())?;
    Ok(())
}

/// Load settings. If the file is missing, return the default. If it
/// fails to parse (truncated write, manual edit, partial download),
/// move the bad file aside to `settings.json.corrupt-<unix-ts>` so
/// the next save doesn't overwrite the diagnostic, then return the
/// default. The caller never has to surface a parse error to the
/// user; a corrupt file degrades to defaults instead of breaking the
/// app on every launch.
pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(err) => return Err(err.to_string()),
    };
    match serde_json::from_str::<AppSettings>(&content) {
        Ok(settings) => Ok(settings),
        Err(parse_err) => {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let backup = path.with_extension(format!("json.corrupt-{stamp}"));
            // Best-effort rename. If the rename itself fails, surface
            // the original parse error; the next save will overwrite
            // the bad file in place.
            let _ = fs::rename(&path, &backup);
            eprintln!(
                "settings: corrupt {} ({}); moved to {}; using defaults",
                path.display(),
                parse_err,
                backup.display()
            );
            Ok(AppSettings::default())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_lock::ENV_MUTEX;

    /// Point `config_dir()` at a temp directory by setting the
    /// override env var for the test process. Holds `ENV_MUTEX` for
    /// the duration of `body` and restores the env afterwards.
    fn with_temp_config<F: FnOnce()>(label: &str, body: F) {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("coreamp-settings-{label}-{stamp}"));
        std::fs::create_dir_all(&dir).expect("temp dir");
        unsafe {
            std::env::set_var("COREAMP_CONFIG_DIR", &dir);
        }
        body();
        unsafe {
            std::env::remove_var("COREAMP_CONFIG_DIR");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_missing_returns_default() {
        with_temp_config("missing", || {
            let s = load_settings().expect("load");
            assert_eq!(s.scan_interval_secs, 5 * 60);
            assert!(s.api_proxy.is_none());
        });
    }

    #[test]
    fn save_then_load_round_trips() {
        with_temp_config("roundtrip", || {
            let original = AppSettings {
                scan_interval_secs: 120,
                api_proxy: Some("http://proxy.local:8080".to_string()),
            };
            save_settings(&original).expect("save");
            let loaded = load_settings().expect("load");
            assert_eq!(loaded.scan_interval_secs, 120);
            assert_eq!(loaded.api_proxy.as_deref(), Some("http://proxy.local:8080"));
        });
    }

    #[test]
    fn corrupt_file_is_moved_aside_and_defaults_returned() {
        with_temp_config("corrupt", || {
            // Write a file that is not valid JSON.
            std::fs::write(settings_path(), "{ not valid json").expect("seed");
            let loaded = load_settings().expect("load returns Ok");
            assert_eq!(loaded.scan_interval_secs, 5 * 60);
            // The corrupt file should have been moved aside.
            let mut found_backup = false;
            for entry in std::fs::read_dir(crate::config_dir()).expect("dir") {
                let entry = entry.expect("entry");
                let name = entry.file_name();
                let name = name.to_string_lossy();
                if name.starts_with("settings.json.corrupt-") {
                    found_backup = true;
                    break;
                }
            }
            assert!(found_backup, "expected a settings.json.corrupt-* backup");
        });
    }
}
