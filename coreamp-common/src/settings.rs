use crate::config_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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

pub fn load_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(path).map_err(|err| err.to_string())?;
    let settings: AppSettings = serde_json::from_str(&content).map_err(|err| err.to_string())?;
    Ok(settings)
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    fs::create_dir_all(config_dir()).map_err(|err| err.to_string())?;
    let content = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    fs::write(settings_path(), content).map_err(|err| err.to_string())
}
