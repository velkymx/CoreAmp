use crate::db;
use crate::metadata;
use crate::musicbrainz;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const SUPPORTED_EXTENSIONS: &[&str] = &["mp3", "flac", "ogg", "wav", "m4a"];

#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub path: PathBuf,
    pub filename: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub metadata_hash: String,
    pub duration_secs: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct PreScannedFile {
    pub path: PathBuf,
    pub metadata_hash: String,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
pub struct ScanSummary {
    pub roots_scanned: usize,
    pub files_discovered: usize,
    pub files_upserted: usize,
}

pub fn default_library_dirs() -> Vec<PathBuf> {
    let home = env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    let music_dir = home.join("Music");
    if music_dir.exists() {
        vec![music_dir]
    } else {
        Vec::new()
    }
}

pub fn configured_library_dirs() -> Vec<PathBuf> {
    if let Some(raw) = env::var_os("COREAMP_LIBRARY_DIRS") {
        let mut dirs = Vec::new();
        for part in raw.to_string_lossy().split(':') {
            let trimmed = part.trim();
            if !trimmed.is_empty() {
                dirs.push(PathBuf::from(trimmed));
            }
        }
        if !dirs.is_empty() {
            return dirs;
        }
    }
    default_library_dirs()
}

fn is_supported_media_file(path: &Path) -> bool {
    let Some(ext) = path.extension() else {
        return false;
    };
    let ext = ext.to_string_lossy().to_ascii_lowercase();
    SUPPORTED_EXTENSIONS
        .iter()
        .any(|supported| supported == &ext)
}

fn compute_metadata_hash(path: &Path, metadata: &fs::Metadata) -> String {
    let mtime_nanos = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!(
        "{}\0{}\0{}",
        path.to_string_lossy(),
        metadata.len(),
        mtime_nanos
    )
}

fn to_scanned_file(path: &Path, metadata_hash: String) -> Option<ScannedFile> {
    let filename = path.file_name()?.to_string_lossy().to_string();
    let file_metadata = metadata::read_track_metadata(path);
    let default_title = path
        .file_stem()
        .map(|name| name.to_string_lossy().to_string());
    Some(ScannedFile {
        path: path.to_path_buf(),
        filename,
        artist: file_metadata.artist,
        album: file_metadata.album,
        title: file_metadata.title.or(default_title),
        year: file_metadata.year,
        genre: file_metadata.genre,
        metadata_hash,
        duration_secs: file_metadata.duration_secs,
    })
}

fn collect_media_dir(root: &Path, results: &mut Vec<PreScannedFile>) {
    let mut stack = vec![root.to_path_buf()];
    while let Some(current_dir) = stack.pop() {
        let entries = match fs::read_dir(&current_dir) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if !is_supported_media_file(&path) {
                continue;
            }
            if let Ok(metadata) = fs::metadata(&path) {
                results.push(PreScannedFile {
                    metadata_hash: compute_metadata_hash(&path, &metadata),
                    path,
                });
            }
        }
    }
}

fn collect_media_path(path: &Path, results: &mut Vec<PreScannedFile>) {
    if !path.exists() {
        return;
    }
    if path.is_dir() {
        collect_media_dir(path, results);
        return;
    }
    if !is_supported_media_file(path) {
        return;
    }
    if let Ok(metadata) = fs::metadata(path) {
        results.push(PreScannedFile {
            metadata_hash: compute_metadata_hash(path, &metadata),
            path: path.to_path_buf(),
        });
    }
}

pub fn scan_library_files(roots: &[PathBuf]) -> Vec<PreScannedFile> {
    let mut files = Vec::new();
    for root in roots {
        collect_media_path(root, &mut files);
    }
    files
}

pub fn scan_explicit_paths(paths: &[PathBuf]) -> Vec<PreScannedFile> {
    let mut files = Vec::new();
    for path in paths {
        collect_media_path(path, &mut files);
    }
    files
}

pub fn index_library_dirs(roots: &[PathBuf]) -> Result<ScanSummary, String> {
    let files = scan_library_files(roots);
    let cached_hashes = db::get_all_metadata_hashes()?;
    let mut changed_files = Vec::new();
    for file in files.iter() {
        let path_str = file.path.to_string_lossy().to_string();
        let is_unchanged =
            matches!(cached_hashes.get(&path_str), Some(hash) if hash == &file.metadata_hash);
        if !is_unchanged
            && let Some(scanned) = to_scanned_file(&file.path, file.metadata_hash.clone())
        {
            changed_files.push(scanned);
        }
    }
    let files_upserted = db::upsert_scanned_files(&changed_files)?;
    
    db::backfill_duration_for_missing()?;
    
    Ok(ScanSummary {
        roots_scanned: roots.len(),
        files_discovered: files.len(),
        files_upserted,
    })
}

pub fn index_configured_library() -> Result<ScanSummary, String> {
    let roots = configured_library_dirs();
    index_library_dirs(&roots)
}

pub fn index_explicit_paths(paths: &[PathBuf]) -> Result<ScanSummary, String> {
    let files = scan_explicit_paths(paths);
    let cached_hashes = db::get_all_metadata_hashes()?;
    let mut changed_files = Vec::new();
    for file in files.iter() {
        let path_str = file.path.to_string_lossy().to_string();
        let is_unchanged =
            matches!(cached_hashes.get(&path_str), Some(hash) if hash == &file.metadata_hash);
        if !is_unchanged
            && let Some(scanned) = to_scanned_file(&file.path, file.metadata_hash.clone())
        {
            changed_files.push(scanned);
        }
    }
    let files_upserted = db::upsert_scanned_files(&changed_files)?;
    Ok(ScanSummary {
        roots_scanned: paths.len(),
        files_discovered: files.len(),
        files_upserted,
    })
}

pub fn enrich_missing_metadata(limit: usize, proxy: Option<&str>) -> Result<usize, String> {
    let candidates = db::list_candidates_for_enrichment(limit)?;
    let mut enriched_count = 0usize;

    for candidate in candidates {
        let lookup = match musicbrainz::lookup_recording(&candidate.query, proxy) {
            Ok(Some(metadata)) => metadata,
            Ok(None) => continue,
            Err(_) => continue,
        };

        let updated_db = db::apply_enriched_metadata(&candidate.path, &lookup)?;
        let updated_file = metadata::write_missing_tags(Path::new(&candidate.path), &lookup)?;
        if updated_db || updated_file {
            enriched_count += 1;
        }
    }

    Ok(enriched_count)
}

#[cfg(test)]
mod tests {
    use super::{is_supported_media_file, scan_explicit_paths, scan_library_files};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        dir.push(format!("coreamp-scan-test-{stamp}"));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    #[test]
    fn filters_supported_extensions() {
        assert!(is_supported_media_file(PathBuf::from("a.mp3").as_path()));
        assert!(is_supported_media_file(PathBuf::from("a.FLAC").as_path()));
        assert!(!is_supported_media_file(PathBuf::from("a.txt").as_path()));
    }

    #[test]
    fn scans_nested_directories() {
        let root = make_temp_dir();
        let nested = root.join("nested");
        fs::create_dir_all(&nested).expect("create nested dir");
        fs::write(root.join("track1.mp3"), b"fake").expect("write mp3");
        fs::write(nested.join("track2.ogg"), b"fake").expect("write ogg");
        fs::write(nested.join("notes.txt"), b"skip").expect("write txt");

        let files = scan_library_files(std::slice::from_ref(&root));
        let names: Vec<_> = files
            .into_iter()
            .map(|f| f.path.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        assert!(names.iter().any(|name| name == "track1.mp3"));
        assert!(names.iter().any(|name| name == "track2.ogg"));
        assert!(!names.iter().any(|name| name == "notes.txt"));

        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn scans_single_file_path() {
        let root = make_temp_dir();
        let file = root.join("single.mp3");
        fs::write(&file, b"fake").expect("write file");

        let files = scan_explicit_paths(std::slice::from_ref(&file));
        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0]
                .path
                .file_name()
                .unwrap()
                .to_string_lossy()
                .to_string(),
            "single.mp3"
        );

        fs::remove_dir_all(root).expect("cleanup");
    }
}
