use base64::Engine;
use coreamp_common::db;
use coreamp_common::ensure_app_data;
use coreamp_common::ipc;
use coreamp_common::library;
use coreamp_common::metadata;
use coreamp_common::playlist;
use coreamp_common::settings;
use rodio::cpal::traits::{DeviceTrait, HostTrait};
use rodio::{Decoder, DeviceSinkBuilder, MixerDeviceSink, Player, Source};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::env;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::path::PathBuf;
use std::process;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, mpsc};
use std::thread;
use std::time::Duration;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize)]
struct ScanResult {
    roots: Vec<String>,
    roots_scanned: usize,
    files_discovered: usize,
    files_upserted: usize,
}

#[derive(Debug, Serialize)]
struct LibraryTrack {
    pub path: String,
    pub filename: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub liked: bool,
}

#[derive(Debug, Deserialize)]
struct TrackMetadataInput {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
}

#[derive(Debug, Serialize)]
struct TrackArtwork {
    mime_type: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
struct ArtistSummary {
    pub name: String,
    pub track_count: usize,
    pub representative_path: String,
}

#[derive(Debug, Serialize)]
struct AlbumSummary {
    pub title: String,
    pub artist: Option<String>,
    pub track_count: usize,
    pub representative_path: String,
}

#[derive(Debug, Serialize)]
struct GenreSummary {
    pub name: String,
    pub track_count: usize,
    pub representative_path: String,
}

#[derive(Debug, Serialize)]
struct PlaylistSummary {
    name: String,
    path: String,
    track_count: usize,
}

#[derive(Debug, Serialize)]
struct NativeAudioStatus {
    available: bool,
    active: bool,
    paused: bool,
    finished: bool,
    current_path: Option<String>,
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct NativeOutputDeviceSummary {
    name: String,
    is_default: bool,
    channels: Option<u16>,
    sample_rate_hz: Option<u32>,
    sample_format: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct NativeOutputDeviceSelection {
    selected_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct TrackSignalDetails {
    format: String,
    sample_rate_hz: Option<u32>,
    bit_depth: Option<u16>,
    channels: Option<u16>,
    bitrate_kbps: Option<u32>,
}

#[derive(Debug, Clone)]
struct NativeAudioRuntimeStatus {
    available: bool,
    active: bool,
    paused: bool,
    finished: bool,
    current_path: Option<String>,
    detail: Option<String>,
}

impl Default for NativeAudioRuntimeStatus {
    fn default() -> Self {
        Self {
            available: true,
            active: false,
            paused: false,
            finished: false,
            current_path: None,
            detail: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
struct NativeEqBandInput {
    frequency: f32,
    gain: f32,
    q: f32,
}

#[derive(Debug, Clone, Deserialize)]
struct NativeDspSettingsInput {
    eq_enabled: bool,
    eq_bands: Vec<NativeEqBandInput>,
    boost_level: u8,
    preamp_db: f32,
    limiter_enabled: bool,
    crossfeed_enabled: bool,
}

#[derive(Debug, Clone)]
struct NativeEqBand {
    frequency: f32,
    gain: f32,
    q: f32,
}

#[derive(Debug, Clone, Default)]
struct NativeDspSettings {
    eq_enabled: bool,
    eq_bands: Vec<NativeEqBand>,
    boost_level: u8,
    preamp_db: f32,
    limiter_enabled: bool,
    crossfeed_enabled: bool,
}

impl From<NativeDspSettingsInput> for NativeDspSettings {
    fn from(value: NativeDspSettingsInput) -> Self {
        Self {
            eq_enabled: value.eq_enabled,
            eq_bands: value
                .eq_bands
                .into_iter()
                .map(|band| NativeEqBand {
                    frequency: band.frequency.clamp(20.0, 20_000.0),
                    gain: band.gain.clamp(-24.0, 24.0),
                    q: band.q.clamp(0.1, 12.0),
                })
                .collect(),
            boost_level: value.boost_level.min(2),
            preamp_db: value.preamp_db.clamp(-18.0, 18.0),
            limiter_enabled: value.limiter_enabled,
            crossfeed_enabled: value.crossfeed_enabled,
        }
    }
}

#[derive(Debug, Default)]
struct SharedNativeDspSettings {
    version: AtomicU64,
    settings: Mutex<NativeDspSettings>,
}

impl SharedNativeDspSettings {
    fn update(&self, next: NativeDspSettings) {
        if let Ok(mut settings) = self.settings.lock() {
            *settings = next;
            self.version.fetch_add(1, Ordering::Relaxed);
        }
    }

    fn snapshot(&self) -> NativeDspSettings {
        self.settings
            .lock()
            .map(|settings| settings.clone())
            .unwrap_or_default()
    }

    fn version(&self) -> u64 {
        self.version.load(Ordering::Relaxed)
    }
}

#[derive(Debug, Clone, Copy, Default)]
struct BiquadCoefficients {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

#[derive(Debug, Clone, Copy, Default)]
struct BiquadState {
    x1: f32,
    x2: f32,
    y1: f32,
    y2: f32,
}

impl BiquadState {
    fn process(&mut self, input: f32, coefficients: BiquadCoefficients) -> f32 {
        let output =
            coefficients.b0 * input + coefficients.b1 * self.x1 + coefficients.b2 * self.x2
                - coefficients.a1 * self.y1
                - coefficients.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = input;
        self.y2 = self.y1;
        self.y1 = output;
        output
    }
}

#[derive(Debug, Clone)]
struct ChannelDspState {
    eq_states: Vec<BiquadState>,
    bass_state: BiquadState,
    warmth_state: BiquadState,
}

impl ChannelDspState {
    fn new(eq_band_count: usize) -> Self {
        Self {
            eq_states: vec![BiquadState::default(); eq_band_count],
            bass_state: BiquadState::default(),
            warmth_state: BiquadState::default(),
        }
    }
}

#[derive(Debug, Clone, Default)]
struct NativeDspRuntime {
    eq_coefficients: Vec<BiquadCoefficients>,
    bass_coefficients: Option<BiquadCoefficients>,
    warmth_coefficients: Option<BiquadCoefficients>,
    preamp_linear: f32,
    limiter_enabled: bool,
    crossfeed_enabled: bool,
    crossfeed_amount: f32,
}

impl NativeDspRuntime {
    fn from_settings(settings: &NativeDspSettings, sample_rate: u32) -> Self {
        let sample_rate = sample_rate.max(1) as f32;
        let eq_coefficients = if settings.eq_enabled {
            settings
                .eq_bands
                .iter()
                .map(|band| peaking_coefficients(sample_rate, band.frequency, band.q, band.gain))
                .collect::<Vec<_>>()
        } else {
            Vec::new()
        };

        let (bass_gain, warmth_gain): (f32, f32) = match settings.boost_level {
            1 => (7.0, 3.0),
            2 => (10.0, 4.5),
            _ => (0.0, 0.0),
        };

        let bass_coefficients = (bass_gain.abs() > f32::EPSILON)
            .then(|| low_shelf_coefficients(sample_rate, 95.0, 0.707, bass_gain));
        let warmth_coefficients = (warmth_gain.abs() > f32::EPSILON)
            .then(|| peaking_coefficients(sample_rate, 185.0, 0.9, warmth_gain));

        Self {
            eq_coefficients,
            bass_coefficients,
            warmth_coefficients,
            preamp_linear: 10.0_f32.powf(settings.preamp_db / 20.0),
            limiter_enabled: settings.limiter_enabled,
            crossfeed_enabled: settings.crossfeed_enabled,
            crossfeed_amount: if settings.crossfeed_enabled {
                0.16
            } else {
                0.0
            },
        }
    }

    fn has_processing(&self) -> bool {
        !self.eq_coefficients.is_empty()
            || self.bass_coefficients.is_some()
            || self.warmth_coefficients.is_some()
            || (self.preamp_linear - 1.0).abs() > f32::EPSILON
            || self.limiter_enabled
            || self.crossfeed_enabled
    }
}

fn soft_limit(input: f32) -> f32 {
    let threshold = 0.92;
    if input.abs() <= threshold {
        return input;
    }
    let sign = input.signum();
    let excess = input.abs() - threshold;
    sign * (threshold + (1.0 - (-excess / (1.0 - threshold)).exp()) * (1.0 - threshold))
}

fn normalized_biquad(b0: f32, b1: f32, b2: f32, a0: f32, a1: f32, a2: f32) -> BiquadCoefficients {
    let normal = if a0.abs() < f32::EPSILON { 1.0 } else { a0 };
    BiquadCoefficients {
        b0: b0 / normal,
        b1: b1 / normal,
        b2: b2 / normal,
        a1: a1 / normal,
        a2: a2 / normal,
    }
}

fn peaking_coefficients(
    sample_rate: f32,
    frequency: f32,
    q: f32,
    gain_db: f32,
) -> BiquadCoefficients {
    let clamped_frequency = frequency.clamp(20.0, sample_rate * 0.45);
    let omega = 2.0 * std::f32::consts::PI * clamped_frequency / sample_rate;
    let alpha = omega.sin() / (2.0 * q.max(0.1));
    let amplitude = 10.0_f32.powf(gain_db / 40.0);
    let cos_omega = omega.cos();
    normalized_biquad(
        1.0 + alpha * amplitude,
        -2.0 * cos_omega,
        1.0 - alpha * amplitude,
        1.0 + alpha / amplitude,
        -2.0 * cos_omega,
        1.0 - alpha / amplitude,
    )
}

fn low_shelf_coefficients(
    sample_rate: f32,
    frequency: f32,
    q: f32,
    gain_db: f32,
) -> BiquadCoefficients {
    let clamped_frequency = frequency.clamp(20.0, sample_rate * 0.45);
    let amplitude = 10.0_f32.powf(gain_db / 40.0);
    let omega = 2.0 * std::f32::consts::PI * clamped_frequency / sample_rate;
    let sin_omega = omega.sin();
    let cos_omega = omega.cos();
    let alpha = sin_omega / (2.0 * q.max(0.1));
    let two_sqrt_a_alpha = 2.0 * amplitude.sqrt() * alpha;
    normalized_biquad(
        amplitude * ((amplitude + 1.0) - (amplitude - 1.0) * cos_omega + two_sqrt_a_alpha),
        2.0 * amplitude * ((amplitude - 1.0) - (amplitude + 1.0) * cos_omega),
        amplitude * ((amplitude + 1.0) - (amplitude - 1.0) * cos_omega - two_sqrt_a_alpha),
        (amplitude + 1.0) + (amplitude - 1.0) * cos_omega + two_sqrt_a_alpha,
        -2.0 * ((amplitude - 1.0) + (amplitude + 1.0) * cos_omega),
        (amplitude + 1.0) + (amplitude - 1.0) * cos_omega - two_sqrt_a_alpha,
    )
}

struct NativeDspSource<S>
where
    S: rodio::Source<Item = f32>,
{
    inner: S,
    shared_settings: Arc<SharedNativeDspSettings>,
    last_settings_version: u64,
    runtime: NativeDspRuntime,
    channel_states: Vec<ChannelDspState>,
    crossfeed_memory: Vec<f32>,
    channel_index: usize,
}

impl<S> NativeDspSource<S>
where
    S: rodio::Source<Item = f32>,
{
    fn new(inner: S, shared_settings: Arc<SharedNativeDspSettings>) -> Self {
        let settings = shared_settings.snapshot();
        let runtime = NativeDspRuntime::from_settings(&settings, inner.sample_rate().get());
        let channels = usize::from(inner.channels().get());
        let channel_states = (0..channels)
            .map(|_| ChannelDspState::new(runtime.eq_coefficients.len()))
            .collect::<Vec<_>>();
        Self {
            inner,
            shared_settings,
            last_settings_version: 0,
            runtime,
            channel_states,
            crossfeed_memory: vec![0.0; channels.max(1)],
            channel_index: 0,
        }
    }

    fn refresh_runtime(&mut self) {
        let version = self.shared_settings.version();
        if version == self.last_settings_version {
            return;
        }
        let settings = self.shared_settings.snapshot();
        self.runtime = NativeDspRuntime::from_settings(&settings, self.inner.sample_rate().get());
        let channels = usize::from(self.inner.channels().get());
        self.channel_states = (0..channels)
            .map(|_| ChannelDspState::new(self.runtime.eq_coefficients.len()))
            .collect::<Vec<_>>();
        self.crossfeed_memory = vec![0.0; channels.max(1)];
        self.channel_index = 0;
        self.last_settings_version = version;
    }
}

impl<S> Iterator for NativeDspSource<S>
where
    S: rodio::Source<Item = f32>,
{
    type Item = f32;

    fn next(&mut self) -> Option<Self::Item> {
        let input = self.inner.next()?;
        self.refresh_runtime();
        if !self.runtime.has_processing() {
            return Some(input);
        }

        if self.channel_states.is_empty() {
            return Some(input);
        }

        let channel = self.channel_index % self.channel_states.len();
        self.channel_index = (self.channel_index + 1) % self.channel_states.len();
        let state = &mut self.channel_states[channel];
        let mut output = input;
        for (coefficients, biquad_state) in self
            .runtime
            .eq_coefficients
            .iter()
            .copied()
            .zip(state.eq_states.iter_mut())
        {
            output = biquad_state.process(output, coefficients);
        }
        if let Some(coefficients) = self.runtime.bass_coefficients {
            output = state.bass_state.process(output, coefficients);
        }
        if let Some(coefficients) = self.runtime.warmth_coefficients {
            output = state.warmth_state.process(output, coefficients);
        }
        output *= self.runtime.preamp_linear;
        if self.runtime.crossfeed_enabled && self.crossfeed_memory.len() == 2 {
            let other_channel = if channel == 0 { 1 } else { 0 };
            let other_sample = self.crossfeed_memory[other_channel];
            self.crossfeed_memory[channel] = output;
            output = output * (1.0 - self.runtime.crossfeed_amount)
                + other_sample * self.runtime.crossfeed_amount;
        } else if channel < self.crossfeed_memory.len() {
            self.crossfeed_memory[channel] = output;
        }
        if self.runtime.limiter_enabled {
            output = soft_limit(output);
        }
        Some(output.clamp(-1.0, 1.0))
    }
}

impl<S> rodio::Source for NativeDspSource<S>
where
    S: rodio::Source<Item = f32>,
{
    fn current_span_len(&self) -> Option<usize> {
        self.inner.current_span_len()
    }

    fn channels(&self) -> rodio::ChannelCount {
        self.inner.channels()
    }

    fn sample_rate(&self) -> rodio::SampleRate {
        self.inner.sample_rate()
    }

    fn total_duration(&self) -> Option<Duration> {
        self.inner.total_duration()
    }
}

enum NativeAudioCommand {
    Play {
        path: String,
        response: mpsc::Sender<Result<(), String>>,
    },
    Pause {
        response: mpsc::Sender<Result<(), String>>,
    },
    Resume {
        response: mpsc::Sender<Result<(), String>>,
    },
    Stop {
        response: mpsc::Sender<Result<(), String>>,
    },
    SetVolume {
        volume: f32,
        response: mpsc::Sender<Result<(), String>>,
    },
    SetDspSettings {
        settings: NativeDspSettings,
        response: mpsc::Sender<Result<(), String>>,
    },
    SetOutputDevice {
        name: Option<String>,
        response: mpsc::Sender<Result<(), String>>,
    },
}

struct NativeAudioController {
    sender: mpsc::Sender<NativeAudioCommand>,
    status: Arc<Mutex<NativeAudioRuntimeStatus>>,
    selected_output_device: Arc<Mutex<Option<String>>>,
}

static NATIVE_AUDIO_CONTROLLER: OnceLock<NativeAudioController> = OnceLock::new();

#[derive(Debug, Clone, Copy)]
enum CliMode {
    Gui,
    Scan,
    Count,
    List { limit: usize },
}

fn print_help() {
    println!("coreamp-app");
    println!("Usage: coreamp-app [--scan] [--count] [--list[=<limit>]] [--help]");
    println!("  --scan          Index configured library folders and exit");
    println!("  --count         Print indexed track count and exit");
    println!("  --list          Print indexed tracks and exit (default limit: 100)");
    println!("  --list=<limit>  Print indexed tracks up to <limit>");
}

fn parse_cli_mode() -> Result<CliMode, String> {
    let mut mode = CliMode::Gui;
    for arg in env::args().skip(1) {
        if arg == "--help" || arg == "-h" {
            print_help();
            process::exit(0);
        } else if arg == "--scan" {
            mode = CliMode::Scan;
        } else if arg == "--count" {
            mode = CliMode::Count;
        } else if arg == "--list" {
            mode = CliMode::List { limit: 100 };
        } else if let Some(raw) = arg.strip_prefix("--list=") {
            let limit = raw
                .parse::<usize>()
                .map_err(|_| format!("Invalid --list limit: {raw}"))?;
            mode = CliMode::List { limit };
        } else {
            return Err(format!("Unknown argument: {arg}"));
        }
    }
    Ok(mode)
}

#[tauri::command]
fn scan_library() -> Result<ScanResult, String> {
    let roots = library::configured_library_dirs();
    let summary = library::index_library_dirs(&roots)?;
    Ok(ScanResult {
        roots: roots
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>(),
        roots_scanned: summary.roots_scanned,
        files_discovered: summary.files_discovered,
        files_upserted: summary.files_upserted,
    })
}

#[tauri::command]
fn scan_paths(paths: Vec<String>) -> Result<ScanResult, String> {
    let explicit_paths = paths
        .into_iter()
        .map(PathBuf::from)
        .collect::<Vec<PathBuf>>();
    let summary = library::index_explicit_paths(&explicit_paths)?;
    Ok(ScanResult {
        roots: explicit_paths
            .iter()
            .map(|path| path.display().to_string())
            .collect::<Vec<_>>(),
        roots_scanned: summary.roots_scanned,
        files_discovered: summary.files_discovered,
        files_upserted: summary.files_upserted,
    })
}

#[tauri::command]
fn list_library(
    limit: Option<usize>,
    genre: Option<String>,
    liked_only: Option<bool>,
    search: Option<String>,
) -> Result<Vec<LibraryTrack>, String> {
    let rows = db::list_library_files(
        limit.unwrap_or(300),
        genre,
        liked_only.unwrap_or(false),
        search,
    )?;
    let tracks = rows
        .into_iter()
        .map(library_track_from_row)
        .collect::<Vec<_>>();
    Ok(tracks)
}

#[tauri::command]
fn toggle_liked(path: String) -> Result<bool, String> {
    db::toggle_liked(&path)
}

#[tauri::command]
fn list_genres() -> Result<Vec<String>, String> {
    db::list_all_genres()
}

#[tauri::command]
fn list_artists() -> Result<Vec<ArtistSummary>, String> {
    let rows = db::list_all_artists()?;
    Ok(rows
        .into_iter()
        .map(|r| ArtistSummary {
            name: r.name,
            track_count: r.track_count,
            representative_path: r.representative_path,
        })
        .collect())
}

#[tauri::command]
fn list_albums() -> Result<Vec<AlbumSummary>, String> {
    let rows = db::list_all_albums()?;
    Ok(rows
        .into_iter()
        .map(|r| AlbumSummary {
            title: r.title,
            artist: r.artist,
            track_count: r.track_count,
            representative_path: r.representative_path,
        })
        .collect())
}

#[tauri::command]
fn list_genre_summaries() -> Result<Vec<GenreSummary>, String> {
    let rows = db::list_all_genre_summaries()?;
    Ok(rows
        .into_iter()
        .map(|r| GenreSummary {
            name: r.name,
            track_count: r.track_count,
            representative_path: r.representative_path,
        })
        .collect())
}

#[tauri::command]
fn record_play(path: String) -> Result<(), String> {
    db::record_play(&path)
}

#[tauri::command]
fn list_recently_played(limit: usize) -> Result<Vec<LibraryTrack>, String> {
    let rows = db::list_recently_played(limit)?;
    Ok(rows
        .into_iter()
        .map(|r| LibraryTrack {
            path: r.path,
            filename: r.filename,
            artist: r.artist,
            album: r.album,
            title: r.title,
            year: r.year,
            genre: r.genre,
            liked: r.liked,
        })
        .collect())
}

#[tauri::command]
fn list_top_artists(limit: usize) -> Result<Vec<ArtistSummary>, String> {
    let rows = db::list_top_artists(limit)?;
    Ok(rows
        .into_iter()
        .map(|r| ArtistSummary {
            name: r.name,
            track_count: r.track_count,
            representative_path: r.representative_path,
        })
        .collect())
}

#[tauri::command]
fn clear_history() -> Result<(), String> {
    db::clear_history()
}

#[tauri::command]
fn library_count() -> Result<u64, String> {
    db::library_count()
}

fn merge_missing(existing: &mut Option<String>, incoming: Option<String>) {
    if existing
        .as_ref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return;
    }
    if let Some(value) = incoming
        && !value.trim().is_empty()
    {
        *existing = Some(value);
    }
}

fn is_placeholder_title(title: &Option<String>, filename: &str) -> bool {
    let Some(title) = title.as_ref() else {
        return true;
    };
    let normalized_title = title.trim().to_ascii_lowercase();
    if normalized_title.is_empty() {
        return true;
    }
    let normalized_filename = filename.trim().to_ascii_lowercase();
    if normalized_title == normalized_filename {
        return true;
    }
    let filename_stem = Path::new(filename)
        .file_stem()
        .map(|value| value.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_else(|| normalized_filename.clone());
    normalized_title == filename_stem
}

fn hydrate_track_from_file(track: &mut LibraryTrack) {
    let file_metadata = metadata::read_track_metadata(Path::new(&track.path));
    merge_missing(&mut track.artist, file_metadata.artist);
    merge_missing(&mut track.album, file_metadata.album);
    if is_placeholder_title(&track.title, &track.filename) {
        track.title = None;
    }
    merge_missing(&mut track.title, file_metadata.title);
    merge_missing(&mut track.year, file_metadata.year);
    merge_missing(&mut track.genre, file_metadata.genre);
}

fn library_track_from_row(row: db::LibraryRow) -> LibraryTrack {
    let mut track = LibraryTrack {
        path: row.path,
        filename: row.filename.clone(),
        artist: row.artist,
        album: row.album,
        title: row.title,
        year: row.year,
        genre: row.genre,
        liked: row.liked,
    };
    hydrate_track_from_file(&mut track);
    track
}

fn track_from_path(path: &Path) -> LibraryTrack {
    let display_path = path.display().to_string();
    if let Ok(Some(row)) = db::get_library_file(&display_path) {
        return library_track_from_row(row);
    }

    let filename = path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| display_path.clone());
    let metadata = metadata::read_track_metadata(path);
    LibraryTrack {
        path: display_path,
        filename: filename.clone(),
        artist: metadata.artist,
        album: metadata.album,
        title: metadata.title,
        year: metadata.year,
        genre: metadata.genre,
        liked: false,
    }
}

#[cfg(target_os = "macos")]
fn run_osascript(script: &str) -> Result<String, String> {
    let output = process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|err| format!("Failed to launch macOS picker: {err}"))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.contains("User canceled") || stderr.contains("(-128)") {
        return Ok(String::new());
    }

    Err(if stderr.is_empty() {
        String::from("macOS picker failed")
    } else {
        stderr
    })
}

#[tauri::command]
fn pick_scan_paths(kind: String) -> Result<Vec<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let script = match kind.as_str() {
            "folder" => {
                r#"set pickedItems to choose folder with prompt "Select folder(s) to scan" with multiple selections allowed
set output to ""
repeat with pickedItem in pickedItems
  set output to output & POSIX path of pickedItem & linefeed
end repeat
return output"#
            }
            "file" => {
                r#"set pickedItems to choose file with prompt "Select audio file(s) or playlists to scan" with multiple selections allowed
set output to ""
repeat with pickedItem in pickedItems
  set output to output & POSIX path of pickedItem & linefeed
end repeat
return output"#
            }
            other => return Err(format!("Unsupported picker kind: {other}")),
        };

        let output = run_osascript(script)?;
        let paths = output
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(String::from)
            .collect::<Vec<_>>();
        Ok(paths)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = kind;
        Err(String::from(
            "Native file picker is currently implemented only on macOS in this build.",
        ))
    }
}

use std::io::Cursor;

#[tauri::command]
fn read_track_artwork(path: String, max_size: Option<u32>) -> Option<TrackArtwork> {
    metadata::read_track_artwork(Path::new(&path)).map(|artwork| {
        let mut data = artwork.data;
        let mut mime_type = artwork.mime_type;

        if let Some(limit) = max_size {
            if let Ok(img) = image::load_from_memory(&data) {
                if img.width() > limit || img.height() > limit {
                    let resized = img.thumbnail(limit, limit);
                    let mut buffer = Vec::new();
                    // Always encode as JPEG for simplicity/speed in transit if resizing
                    if resized.write_to(&mut Cursor::new(&mut buffer), image::ImageFormat::Jpeg).is_ok() {
                        data = buffer;
                        mime_type = String::from("image/jpeg");
                    }
                }
            }
        }

        TrackArtwork {
            mime_type,
            data_base64: base64::engine::general_purpose::STANDARD.encode(data),
        }
    })
}

fn playlist_summary_from_path(path: &Path) -> Result<PlaylistSummary, String> {
    let entries = playlist::read_playlist(path).map_err(|err| err.to_string())?;
    Ok(PlaylistSummary {
        name: path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| String::from("playlist")),
        path: path.display().to_string(),
        track_count: entries.len(),
    })
}

#[tauri::command]
fn list_playlists() -> Result<Vec<PlaylistSummary>, String> {
    let paths = playlist::list_playlists().map_err(|err| err.to_string())?;
    paths
        .iter()
        .map(|path| playlist_summary_from_path(path))
        .collect()
}

#[tauri::command]
fn save_playlist(name: String, paths: Vec<String>) -> Result<PlaylistSummary, String> {
    let entries = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    let written_path = playlist::write_playlist(&name, &entries).map_err(|err| err.to_string())?;
    playlist_summary_from_path(&written_path)
}

#[tauri::command]
fn append_to_playlist(
    playlist_path: String,
    paths: Vec<String>,
) -> Result<PlaylistSummary, String> {
    let target = PathBuf::from(&playlist_path);
    let mut entries = playlist::read_playlist(&target).map_err(|err| err.to_string())?;
    let mut existing: HashSet<_> = entries.iter().cloned().collect();
    for path in paths {
        let pb = PathBuf::from(path);
        if existing.insert(pb.clone()) {
            entries.push(pb);
        }
    }
    let target_name = target
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| String::from("playlist"));
    let written_path =
        playlist::write_playlist(&target_name, &entries).map_err(|err| err.to_string())?;
    playlist_summary_from_path(&written_path)
}

#[tauri::command]
fn load_playlist(playlist_path: String) -> Result<Vec<LibraryTrack>, String> {
    let entries =
        playlist::read_playlist(Path::new(&playlist_path)).map_err(|err| err.to_string())?;
    Ok(entries
        .iter()
        .map(|path| track_from_path(path))
        .collect::<Vec<_>>())
}

#[tauri::command]
fn import_playlist_file(source_path: String) -> Result<PlaylistSummary, String> {
    let source = PathBuf::from(&source_path);
    let entries = playlist::read_playlist(&source).map_err(|err| err.to_string())?;
    let target_name = source
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| String::from("playlist"));
    let written_path =
        playlist::write_playlist(&target_name, &entries).map_err(|err| err.to_string())?;
    playlist_summary_from_path(&written_path)
}

#[tauri::command]
fn delete_playlist(playlist_path: String) -> Result<(), String> {
    let target = PathBuf::from(&playlist_path);
    playlist::delete_playlist(&target).map_err(|err| err.to_string())
}

#[tauri::command]
fn dedup_playlist(playlist_path: String) -> Result<PlaylistSummary, String> {
    let target = PathBuf::from(&playlist_path);
    let entries = playlist::read_playlist(&target).map_err(|err| err.to_string())?;
    let mut seen = std::collections::HashSet::new();
    let deduped: Vec<PathBuf> = entries
        .into_iter()
        .filter(|p| seen.insert(p.clone()))
        .collect();
    let target_name = target
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| String::from("playlist"));
    let written_path =
        playlist::write_playlist(&target_name, &deduped).map_err(|err| err.to_string())?;
    playlist_summary_from_path(&written_path)
}

#[tauri::command]
fn playlist_contains(playlist_path: String, track_path: String) -> Result<bool, String> {
    let target = PathBuf::from(&playlist_path);
    let entries = playlist::read_playlist(&target).map_err(|err| err.to_string())?;
    let check = PathBuf::from(&track_path);
    Ok(entries.contains(&check))
}

#[tauri::command]
fn write_missing_tags_for_path(path: String) -> Result<bool, String> {
    let row = db::get_library_file(&path)?
        .ok_or_else(|| format!("Track not found in library: {path}"))?;
    let metadata = metadata::TrackMetadata {
        artist: row.artist,
        album: row.album,
        title: row.title,
        year: row.year,
        genre: row.genre,
    };
    metadata::write_missing_tags(Path::new(&path), &metadata)
}

fn normalize_metadata_input(input: TrackMetadataInput) -> metadata::TrackMetadata {
    let clean = |value: Option<String>| {
        value.and_then(|raw| {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        })
    };

    metadata::TrackMetadata {
        artist: clean(input.artist),
        album: clean(input.album),
        title: clean(input.title),
        year: clean(input.year),
        genre: clean(input.genre),
    }
}

#[tauri::command]
fn update_track_metadata_for_path(
    path: String,
    metadata_input: TrackMetadataInput,
) -> Result<LibraryTrack, String> {
    let metadata = normalize_metadata_input(metadata_input);
    metadata::write_tags(Path::new(&path), &metadata)?;
    db::update_track_metadata(&path, &metadata)?;
    Ok(track_from_path(Path::new(&path)))
}

#[tauri::command]
fn get_settings() -> Result<settings::AppSettings, String> {
    settings::load_settings()
}

#[tauri::command]
fn save_settings(scan_interval_secs: u64, api_proxy: Option<String>) -> Result<(), String> {
    if scan_interval_secs == 0 {
        return Err(String::from("scan_interval_secs must be greater than 0"));
    }
    let normalized_proxy = api_proxy.and_then(|value| {
        let trimmed = value.trim().to_string();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed)
        }
    });
    let settings = settings::AppSettings {
        scan_interval_secs,
        api_proxy: normalized_proxy,
    };
    settings::save_settings(&settings)
}

fn with_runtime_status(
    status: &Arc<Mutex<NativeAudioRuntimeStatus>>,
    update: impl FnOnce(&mut NativeAudioRuntimeStatus),
) {
    if let Ok(mut lock) = status.lock() {
        update(&mut lock);
    }
}

fn path_format_label(path: &Path) -> String {
    path.extension()
        .map(|ext| ext.to_string_lossy().to_string())
        .filter(|ext| !ext.trim().is_empty())
        .map(|ext| ext.to_ascii_uppercase())
        .unwrap_or_else(|| String::from("Unknown"))
}

fn parse_wav_bit_depth(path: &Path) -> Option<u16> {
    use std::io::{BufReader, Read};
    let file = std::fs::File::open(path).ok()?;
    let mut reader = BufReader::new(file);
    let mut buf = [0u8; 512];
    let n = reader.read(&mut buf).ok()?;
    let bytes = &buf[..n];
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return None;
    }
    let mut cursor = 12usize;
    while cursor + 8 <= bytes.len() {
        let chunk_id = &bytes[cursor..cursor + 4];
        let chunk_size =
            u32::from_le_bytes(bytes[cursor + 4..cursor + 8].try_into().ok()?) as usize;
        cursor += 8;
        if chunk_id == b"fmt " && cursor + chunk_size <= bytes.len() && chunk_size >= 16 {
            return Some(u16::from_le_bytes(
                bytes[cursor + 14..cursor + 16].try_into().ok()?,
            ));
        }
        cursor = cursor.saturating_add(chunk_size + (chunk_size % 2));
    }
    None
}

fn infer_bit_depth(path: &Path) -> Option<u16> {
    let ext = path
        .extension()
        .map(|ext| ext.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "wav" => parse_wav_bit_depth(path),
        "flac" => None,
        _ => None,
    }
}

#[tauri::command]
fn read_track_signal_details(path: String) -> Result<TrackSignalDetails, String> {
    let file_path = PathBuf::from(&path);
    let file = File::open(&file_path).map_err(|err| err.to_string())?;
    let decoder = Decoder::new(BufReader::new(file)).map_err(|err| err.to_string())?;
    let duration = decoder.total_duration();
    let file_size_bytes = std::fs::metadata(&file_path)
        .map(|meta| meta.len())
        .unwrap_or(0);
    let bitrate_kbps = duration.and_then(|duration| {
        let seconds = duration.as_secs_f64();
        if seconds <= 0.0 || file_size_bytes == 0 {
            return None;
        }
        Some(((file_size_bytes as f64 * 8.0) / seconds / 1000.0).round() as u32)
    });

    Ok(TrackSignalDetails {
        format: path_format_label(&file_path),
        sample_rate_hz: Some(decoder.sample_rate().get()),
        bit_depth: infer_bit_depth(&file_path),
        channels: Some(decoder.channels().get()),
        bitrate_kbps,
    })
}

fn device_label(device: &rodio::cpal::Device) -> Option<String> {
    device
        .description()
        .ok()
        .map(|description| description.name().to_string())
}

fn list_native_output_devices_internal() -> Result<Vec<NativeOutputDeviceSummary>, String> {
    let host = rodio::cpal::default_host();
    let default_name = host
        .default_output_device()
        .and_then(|device| device_label(&device));

    let mut devices = host
        .output_devices()
        .map_err(|err| err.to_string())?
        .filter_map(|device| {
            let name = device_label(&device)?;
            let config = device.default_output_config().ok();
            Some(NativeOutputDeviceSummary {
                is_default: default_name
                    .as_ref()
                    .is_some_and(|default| default == &name),
                name,
                channels: config.as_ref().map(|config| config.channels()),
                sample_rate_hz: config.as_ref().map(|config| config.sample_rate()),
                sample_format: config
                    .as_ref()
                    .map(|config| format!("{:?}", config.sample_format())),
            })
        })
        .collect::<Vec<_>>();

    devices.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(devices)
}

fn find_output_device_by_name(name: &str) -> Result<Option<rodio::cpal::Device>, String> {
    let host = rodio::cpal::default_host();
    let devices = host.output_devices().map_err(|err| err.to_string())?;
    for device in devices {
        if let Some(device_name) = device_label(&device)
            && device_name == name
        {
            return Ok(Some(device));
        }
    }
    Ok(None)
}

fn ensure_output_stream(
    stream: &mut Option<MixerDeviceSink>,
    player: &mut Option<Player>,
    selected_device_name: Option<&str>,
) -> Result<(), String> {
    if stream.is_some() && player.is_some() {
        return Ok(());
    }
    let created_stream = if let Some(device_name) = selected_device_name {
        let device = find_output_device_by_name(device_name)?
            .ok_or_else(|| format!("Selected output device is unavailable: {device_name}"))?;
        DeviceSinkBuilder::from_device(device)
            .map_err(|err| {
                format!("Failed to configure selected audio output device {device_name}: {err}")
            })?
            .open_sink_or_fallback()
            .map_err(|err| {
                format!("Failed to open selected audio output device {device_name}: {err}")
            })?
    } else {
        DeviceSinkBuilder::open_default_sink().map_err(|err| {
            format!("No default audio output device available for CPAL playback: {err}")
        })?
    };
    let created_player = Player::connect_new(created_stream.mixer());
    *stream = Some(created_stream);
    *player = Some(created_player);
    Ok(())
}

fn load_track_into_sink(
    player: &Player,
    path: &str,
    current_volume: f32,
    dsp_settings: Arc<SharedNativeDspSettings>,
) -> Result<(), String> {
    let file = File::open(path).map_err(|err| err.to_string())?;
    let source = Decoder::new(BufReader::new(file)).map_err(|err| err.to_string())?;
    let source = NativeDspSource::new(source, dsp_settings);
    player.stop();
    player.clear();
    player.set_volume(current_volume);
    player.append(source);
    Ok(())
}

fn run_native_audio_thread(
    receiver: mpsc::Receiver<NativeAudioCommand>,
    status: Arc<Mutex<NativeAudioRuntimeStatus>>,
    dsp_settings: Arc<SharedNativeDspSettings>,
    selected_output_device: Arc<Mutex<Option<String>>>,
) {
    let mut stream: Option<MixerDeviceSink> = None;
    let mut player: Option<Player> = None;
    let mut current_path: Option<String> = None;
    let mut current_volume: f32 = 0.8;
    let mut selected_output_device_name = selected_output_device
        .lock()
        .map(|name| name.clone())
        .unwrap_or_default();

    loop {
        match receiver.recv_timeout(Duration::from_millis(200)) {
            Ok(command) => match command {
                NativeAudioCommand::Play { path, response } => {
                    let result = (|| -> Result<(), String> {
                        ensure_output_stream(
                            &mut stream,
                            &mut player,
                            selected_output_device_name.as_deref(),
                        )?;
                        let active_player = player
                            .as_ref()
                            .ok_or_else(|| String::from("Missing native audio player"))?;
                        load_track_into_sink(
                            active_player,
                            &path,
                            current_volume,
                            Arc::clone(&dsp_settings),
                        )?;
                        active_player.play();
                        current_path = Some(path.clone());
                        with_runtime_status(&status, |runtime| {
                            runtime.available = true;
                            runtime.active = true;
                            runtime.paused = false;
                            runtime.finished = false;
                            runtime.current_path = Some(path.clone());
                            runtime.detail = None;
                        });
                        Ok(())
                    })();

                    if let Err(err) = &result {
                        let detail = err.clone();
                        with_runtime_status(&status, |runtime| {
                            runtime.available = false;
                            runtime.active = false;
                            runtime.paused = false;
                            runtime.finished = false;
                            runtime.current_path = None;
                            runtime.detail = Some(detail);
                        });
                    }
                    let _ = response.send(result);
                }
                NativeAudioCommand::Pause { response } => {
                    let result = if let Some(active_player) = player.as_ref() {
                        active_player.pause();
                        with_runtime_status(&status, |runtime| {
                            runtime.active = current_path.is_some();
                            runtime.paused = true;
                            runtime.finished = false;
                        });
                        Ok(())
                    } else {
                        Err(String::from("No native track loaded"))
                    };
                    let _ = response.send(result);
                }
                NativeAudioCommand::Resume { response } => {
                    let result = if let Some(active_player) = player.as_ref() {
                        active_player.play();
                        with_runtime_status(&status, |runtime| {
                            runtime.active = current_path.is_some();
                            runtime.paused = false;
                            runtime.finished = false;
                        });
                        Ok(())
                    } else {
                        Err(String::from("No native track loaded"))
                    };
                    let _ = response.send(result);
                }
                NativeAudioCommand::Stop { response } => {
                    if let Some(existing) = player.take() {
                        existing.stop();
                    }
                    if let Some(active_stream) = stream.as_ref() {
                        let created_player = Player::connect_new(active_stream.mixer());
                        created_player.set_volume(current_volume);
                        player = Some(created_player);
                    }
                    current_path = None;
                    with_runtime_status(&status, |runtime| {
                        runtime.active = false;
                        runtime.paused = false;
                        runtime.finished = false;
                        runtime.current_path = None;
                    });
                    let _ = response.send(Ok(()));
                }
                NativeAudioCommand::SetVolume { volume, response } => {
                    current_volume = volume.clamp(0.0, 1.0);
                    if let Some(active_player) = player.as_ref() {
                        active_player.set_volume(current_volume);
                    }
                    let _ = response.send(Ok(()));
                }
                NativeAudioCommand::SetDspSettings { settings, response } => {
                    dsp_settings.update(settings);
                    let _ = response.send(Ok(()));
                }
                NativeAudioCommand::SetOutputDevice { name, response } => {
                    let next_name = name.and_then(|value| {
                        let trimmed = value.trim().to_string();
                        if trimmed.is_empty() {
                            None
                        } else {
                            Some(trimmed)
                        }
                    });

                    let result = (|| -> Result<(), String> {
                        if let Some(device_name) = next_name.as_deref() {
                            let _ = find_output_device_by_name(device_name)?.ok_or_else(|| {
                                format!("Selected output device is unavailable: {device_name}")
                            })?;
                        }

                        selected_output_device_name = next_name.clone();
                        if let Ok(mut lock) = selected_output_device.lock() {
                            *lock = selected_output_device_name.clone();
                        }

                        let was_paused = player.as_ref().is_some_and(Player::is_paused);
                        stream = None;
                        player = None;

                        if let Some(path) = current_path.clone() {
                            ensure_output_stream(
                                &mut stream,
                                &mut player,
                                selected_output_device_name.as_deref(),
                            )?;
                            let active_player = player
                                .as_ref()
                                .ok_or_else(|| String::from("Missing native audio player"))?;
                            load_track_into_sink(
                                active_player,
                                &path,
                                current_volume,
                                Arc::clone(&dsp_settings),
                            )?;
                            if let Some(active_player) = player.as_ref() {
                                if was_paused {
                                    active_player.pause();
                                } else {
                                    active_player.play();
                                }
                            }
                        } else {
                            ensure_output_stream(
                                &mut stream,
                                &mut player,
                                selected_output_device_name.as_deref(),
                            )?;
                            if let Some(active_player) = player.as_ref() {
                                active_player.set_volume(current_volume);
                            }
                        }

                        with_runtime_status(&status, |runtime| {
                            runtime.available = true;
                            runtime.detail = None;
                        });
                        Ok(())
                    })();

                    if let Err(err) = &result {
                        with_runtime_status(&status, |runtime| {
                            runtime.detail = Some(err.clone());
                        });
                    }
                    let _ = response.send(result);
                }
            },
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }

        if let Some(active_player) = player.as_ref()
            && current_path.is_some()
            && active_player.empty()
        {
            current_path = None;
            with_runtime_status(&status, |runtime| {
                runtime.active = false;
                runtime.paused = false;
                runtime.finished = true;
                runtime.current_path = None;
            });
        }
    }
}

fn native_audio_controller() -> &'static NativeAudioController {
    NATIVE_AUDIO_CONTROLLER.get_or_init(|| {
        let (sender, receiver) = mpsc::channel();
        let status = Arc::new(Mutex::new(NativeAudioRuntimeStatus::default()));
        let selected_output_device = Arc::new(Mutex::new(None));
        let thread_status = Arc::clone(&status);
        let dsp_settings = Arc::new(SharedNativeDspSettings::default());
        let thread_dsp_settings = Arc::clone(&dsp_settings);
        let thread_selected_output_device = Arc::clone(&selected_output_device);
        thread::spawn(move || {
            run_native_audio_thread(
                receiver,
                thread_status,
                thread_dsp_settings,
                thread_selected_output_device,
            )
        });
        NativeAudioController {
            sender,
            status,
            selected_output_device,
        }
    })
}

fn dispatch_native_audio_command(
    build: impl FnOnce(mpsc::Sender<Result<(), String>>) -> NativeAudioCommand,
) -> Result<(), String> {
    let controller = native_audio_controller();
    let (response_sender, response_receiver) = mpsc::channel();
    controller
        .sender
        .send(build(response_sender))
        .map_err(|_| String::from("Native audio thread unavailable"))?;
    response_receiver
        .recv()
        .map_err(|_| String::from("Native audio response channel closed"))?
}

#[tauri::command]
fn native_audio_play(path: String) -> Result<(), String> {
    dispatch_native_audio_command(|response| NativeAudioCommand::Play { path, response })
}

#[tauri::command]
fn native_audio_pause() -> Result<(), String> {
    dispatch_native_audio_command(|response| NativeAudioCommand::Pause { response })
}

#[tauri::command]
fn native_audio_resume() -> Result<(), String> {
    dispatch_native_audio_command(|response| NativeAudioCommand::Resume { response })
}

#[tauri::command]
fn native_audio_stop() -> Result<(), String> {
    dispatch_native_audio_command(|response| NativeAudioCommand::Stop { response })
}

#[tauri::command]
fn native_audio_set_volume(volume: f32) -> Result<(), String> {
    dispatch_native_audio_command(|response| NativeAudioCommand::SetVolume { volume, response })
}

#[tauri::command]
fn native_audio_set_dsp_settings(settings: NativeDspSettingsInput) -> Result<(), String> {
    let settings = NativeDspSettings::from(settings);
    dispatch_native_audio_command(|response| NativeAudioCommand::SetDspSettings {
        settings,
        response,
    })
}

#[tauri::command]
fn list_native_output_devices() -> Result<Vec<NativeOutputDeviceSummary>, String> {
    list_native_output_devices_internal()
}

#[tauri::command]
fn native_audio_selected_output_device() -> NativeOutputDeviceSelection {
    let controller = native_audio_controller();
    let selected_name = controller
        .selected_output_device
        .lock()
        .map(|name| name.clone())
        .unwrap_or_default();
    NativeOutputDeviceSelection { selected_name }
}

#[tauri::command]
fn native_audio_set_output_device(name: Option<String>) -> Result<(), String> {
    dispatch_native_audio_command(|response| NativeAudioCommand::SetOutputDevice { name, response })
}

#[tauri::command]
fn native_audio_status() -> NativeAudioStatus {
    let controller = native_audio_controller();
    let mut status = match controller.status.lock() {
        Ok(status) => status,
        Err(_) => {
            return NativeAudioStatus {
                available: false,
                active: false,
                paused: false,
                finished: false,
                current_path: None,
                detail: Some(String::from("Native audio status lock poisoned")),
            };
        }
    };

    let snapshot = NativeAudioStatus {
        available: status.available,
        active: status.active,
        paused: status.paused,
        finished: status.finished,
        current_path: status.current_path.clone(),
        detail: status.detail.clone(),
    };
    status.finished = false;
    snapshot
}

fn main() {
    let cli_mode = match parse_cli_mode() {
        Ok(mode) => mode,
        Err(err) => {
            eprintln!("{err}");
            print_help();
            process::exit(2);
        }
    };

    if let Err(err) = ensure_app_data() {
        eprintln!("Failed to prepare local CoreAmp data: {err}");
        process::exit(1);
    }

    match cli_mode {
        CliMode::Scan => {
            match scan_library() {
                Ok(summary) => {
                    println!(
                        "scan complete roots={} discovered={} upserted={}",
                        summary.roots_scanned, summary.files_discovered, summary.files_upserted
                    );
                    for root in summary.roots {
                        println!("root: {root}");
                    }
                }
                Err(err) => {
                    eprintln!("scan failed: {err}");
                    process::exit(1);
                }
            }
            return;
        }
        CliMode::Count => {
            match library_count() {
                Ok(count) => println!("tracks: {count}"),
                Err(err) => {
                    eprintln!("count failed: {err}");
                    process::exit(1);
                }
            }
            return;
        }
        CliMode::List { limit } => {
            match list_library(Some(limit), None, None, None) {
                Ok(tracks) => {
                    for track in tracks {
                        println!(
                            "{} | {} | {}",
                            track.artist.unwrap_or_else(|| String::from("Unknown")),
                            track.title.unwrap_or_else(|| String::from("Unknown title")),
                            track.path
                        );
                    }
                }
                Err(err) => {
                    eprintln!("list failed: {err}");
                    process::exit(1);
                }
            }
            return;
        }
        CliMode::Gui => {}
    }

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(feature = "devtools")]
            if let Some(window) = app.get_webview_window("main") {
                window.open_devtools();
            }
            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let mut last_id = ipc::read_daemon_events(None, Some(1))
                    .ok()
                    .and_then(|events| events.last().map(|event| event.id))
                    .unwrap_or(0);

                loop {
                    if let Ok(events) = ipc::read_daemon_events(Some(last_id), Some(100)) {
                        for event in events {
                            last_id = event.id;
                            let _ = app_handle.emit("daemon://event", &event);
                        }
                    }
                    thread::sleep(Duration::from_secs(2));
                }
            });

            let previous_item =
                MenuItemBuilder::with_id("previous_track", "Previous").build(app)?;
            let toggle_item =
                MenuItemBuilder::with_id("toggle_playback", "Play/Pause").build(app)?;
            let next_item = MenuItemBuilder::with_id("next_track", "Next").build(app)?;
            let scan_item = MenuItemBuilder::with_id("scan_library", "Scan Library").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .items(&[
                    &previous_item,
                    &toggle_item,
                    &next_item,
                    &scan_item,
                    &quit_item,
                ])
                .build()?;

            TrayIconBuilder::new()
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "previous_track" => {
                        let _ = app.emit("tray://control", "previous");
                    }
                    "toggle_playback" => {
                        let _ = app.emit("tray://control", "toggle");
                    }
                    "next_track" => {
                        let _ = app.emit("tray://control", "next");
                    }
                    "scan_library" => {
                        let roots = library::configured_library_dirs();
                        match library::index_library_dirs(&roots) {
                            Ok(summary) => {
                                let payload = ScanResult {
                                    roots: roots
                                        .iter()
                                        .map(|path| path.display().to_string())
                                        .collect::<Vec<_>>(),
                                    roots_scanned: summary.roots_scanned,
                                    files_discovered: summary.files_discovered,
                                    files_upserted: summary.files_upserted,
                                };
                                let _ = app.emit("tray://scan-complete", payload);
                            }
                            Err(err) => {
                                let _ = app.emit("tray://scan-failed", err);
                            }
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                        && let Some(window) = tray.app_handle().get_webview_window("main")
                    {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scan_library,
            scan_paths,
            pick_scan_paths,
            list_library,
            library_count,
            list_genres,
            list_artists,
            list_albums,
            list_genre_summaries,
            toggle_liked,
            record_play,
            list_recently_played,
            list_top_artists,
            clear_history,
            list_playlists,
            save_playlist,
            append_to_playlist,
            load_playlist,
            import_playlist_file,
            delete_playlist,
            dedup_playlist,
            playlist_contains,
            read_track_artwork,
            read_track_signal_details,
            write_missing_tags_for_path,
            update_track_metadata_for_path,
            get_settings,
            save_settings,
            native_audio_play,
            native_audio_pause,
            native_audio_resume,
            native_audio_stop,
            native_audio_set_volume,
            native_audio_set_dsp_settings,
            list_native_output_devices,
            native_audio_selected_output_device,
            native_audio_set_output_device,
            native_audio_status
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|err| {
            eprintln!("CoreAmp app failed to start: {err}");
            process::exit(1);
        });
}
