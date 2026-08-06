use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;

pub mod db;
pub mod error;
pub mod ipc;
pub mod library;
pub mod metadata;
pub mod musicbrainz;
pub mod path;
pub mod playlist;
pub mod settings;

pub fn app_name() -> &'static str {
    "CoreAmp"
}

pub fn config_dir() -> PathBuf {
    if let Some(override_dir) = env::var_os("COREAMP_CONFIG_DIR") {
        let candidate = PathBuf::from(override_dir);
        if !candidate.as_os_str().is_empty() {
            return candidate;
        }
    }

    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));

    if cfg!(target_os = "macos") {
        home.join("Library")
            .join("Application Support")
            .join(app_name())
    } else {
        home.join(".config").join(app_name())
    }
}

pub fn playlists_dir() -> PathBuf {
    config_dir().join("playlists")
}

pub fn metadata_db_path() -> PathBuf {
    config_dir().join("local.db")
}

pub fn daemon_default_interval_secs() -> u64 {
    5 * 60
}

pub fn ensure_config_dirs() -> io::Result<()> {
    fs::create_dir_all(config_dir())?;
    fs::create_dir_all(playlists_dir())?;
    Ok(())
}

pub fn ensure_app_data() -> Result<(), String> {
    ensure_config_dirs().map_err(|err| err.to_string())?;
    db::init_metadata_db().map_err(String::from)
}

#[cfg(test)]
pub(crate) mod test_lock {
    //! Process-wide mutex for tests that mutate `COREAMP_CONFIG_DIR`
    //! or `COREAMP_LIBRARY_DIRS`. `cargo test` runs tests in parallel
    //! by default; env-var mutation is process-wide and not thread-safe.
    pub static ENV_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());
}

#[cfg(test)]
mod tests {
    use super::config_dir;
    use super::test_lock::ENV_MUTEX;

    #[test]
    fn config_dir_ends_with_app_name() {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        assert!(config_dir().ends_with("CoreAmp"));
    }
}
