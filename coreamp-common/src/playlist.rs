use crate::playlists_dir;
use std::ffi::OsStr;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn sanitize_playlist_name(name: &str) -> String {
    let trimmed = name.trim();
    let fallback = "playlist";
    let base = if trimmed.is_empty() {
        fallback
    } else {
        trimmed
    };
    base.chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '\0' => '_',
            _ => ch,
        })
        .collect()
}

fn with_m3u_extension(name: &str) -> String {
    let path = Path::new(name);
    if path.extension() == Some(OsStr::new("m3u")) {
        name.to_string()
    } else {
        format!("{name}.m3u")
    }
}

pub fn parse_m3u(content: &str) -> Vec<PathBuf> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(PathBuf::from)
        .collect()
}

pub fn serialize_m3u(entries: &[PathBuf]) -> String {
    let mut out = String::from("#EXTM3U\n");
    for entry in entries {
        out.push_str(&entry.to_string_lossy());
        out.push('\n');
    }
    out
}

pub fn write_playlist(name: &str, entries: &[PathBuf]) -> io::Result<PathBuf> {
    let safe_name = sanitize_playlist_name(name);
    let file_name = with_m3u_extension(&safe_name);
    let target = playlists_dir().join(file_name);
    fs::create_dir_all(playlists_dir())?;
    let temp_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let temp_path = target.with_extension(format!("m3u.tmp.{temp_suffix}"));
    fs::write(&temp_path, serialize_m3u(entries))?;
    fs::rename(&temp_path, &target)?;
    Ok(target)
}

pub fn read_playlist(path: &Path) -> io::Result<Vec<PathBuf>> {
    let content = fs::read_to_string(path)?;
    Ok(parse_m3u(&content))
}

pub fn list_playlists() -> io::Result<Vec<PathBuf>> {
    fs::create_dir_all(playlists_dir())?;
    let mut paths = fs::read_dir(playlists_dir())?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension() == Some(OsStr::new("m3u")))
        .collect::<Vec<_>>();
    paths.sort();
    Ok(paths)
}

#[cfg(test)]
mod tests {
    use super::{parse_m3u, sanitize_playlist_name, serialize_m3u, with_m3u_extension};
    use std::path::PathBuf;

    #[test]
    fn parse_ignores_comments_and_empty_lines() {
        let entries = parse_m3u("#EXTM3U\n#EXTINF:123,Artist - Track\n./a.mp3\n\n./b.flac");
        assert_eq!(
            entries,
            vec![PathBuf::from("./a.mp3"), PathBuf::from("./b.flac")]
        );
    }

    #[test]
    fn serialize_includes_extm3u_header() {
        let content = serialize_m3u(&[PathBuf::from("a.mp3"), PathBuf::from("b.ogg")]);
        assert!(content.starts_with("#EXTM3U\n"));
        assert!(content.contains("a.mp3"));
        assert!(content.contains("b.ogg"));
    }

    #[test]
    fn sanitize_replaces_path_separators() {
        assert_eq!(sanitize_playlist_name("mix/2026"), "mix_2026");
        assert_eq!(sanitize_playlist_name(""), "playlist");
    }

    #[test]
    fn extension_is_added_if_missing() {
        assert_eq!(with_m3u_extension("daily"), "daily.m3u");
        assert_eq!(with_m3u_extension("daily.m3u"), "daily.m3u");
    }
}
