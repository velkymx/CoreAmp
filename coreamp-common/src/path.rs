//! Path validation for Tauri IPC commands.
//!
//! Any command that takes a filesystem path from the webview must pass it
//! through [`validate_library_path`] before doing I/O. The validator
//! canonicalizes the input (which collapses `..` segments and resolves
//! symlinks), then confirms the result lives under one of the
//! `asset_scope_roots()` directories. This prevents the webview (or any
//! script injected via dependency / XSS) from reading or writing outside
//! the user's music library + playlist storage.
//!
//! Use the helper from the IPC layer:
//! ```ignore
//! #[tauri::command]
//! fn read_track_artwork(path: String) -> Result<Option<TrackArtwork>, String> {
//!     let safe = coreamp_common::path::validate_library_path(Path::new(&path))?;
//!     lofty::read_from_path(&safe).map(Some).map_err(Into::into)
//! }
//! ```

use std::path::{Component, Path, PathBuf};

use crate::error::CoreampError;
use crate::library::asset_scope_roots;

/// Validate that a path is inside an approved root and return its
/// canonicalized form. Rejects:
/// - paths that don't exist
/// - paths whose canonical form contains `..` after resolution (defence in
///   depth against symlink escapes)
/// - paths not under any `asset_scope_roots()` entry
///
/// The returned `PathBuf` is canonical; use it for all subsequent I/O.
pub fn validate_library_path(path: &Path) -> Result<PathBuf, CoreampError> {
    if !path.exists() {
        return Err(CoreampError::Message(format!(
            "path does not exist: {}",
            path.display()
        )));
    }

    // Canonicalize first. This resolves symlinks and `..` segments and
    // gives us a stable on-disk path to compare against the approved roots.
    let canonical = path.canonicalize().map_err(CoreampError::Io)?;

    // Defence in depth: after canonicalization, a `..` component would
    // indicate the filesystem is doing something unexpected (e.g. a
    // race with a symlink swap). Refuse it.
    if canonical
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(CoreampError::Message(format!(
            "path resolves outside its parent: {}",
            canonical.display()
        )));
    }

    let approved_roots: Vec<PathBuf> = asset_scope_roots()
        .into_iter()
        .filter_map(|root| root.canonicalize().ok())
        .collect();

    if approved_roots.is_empty() {
        return Err(CoreampError::Message(
            "no approved library roots configured".to_string(),
        ));
    }

    if !approved_roots.iter().any(|root| canonical.starts_with(root)) {
        return Err(CoreampError::Message(format!(
            "path is outside approved roots: {}",
            canonical.display()
        )));
    }

    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_root(temp: &std::path::Path, name: &str) -> PathBuf {
        let root = temp.join(name);
        std::fs::create_dir_all(&root).unwrap();
        root
    }

    fn configure_library_roots(roots: &[PathBuf]) {
        // `configured_library_dirs()` reads the env var on every call,
        // so we just set it directly. The mutex is acquired in each
        // test (not this helper) so it covers the entire test body.
        let joined = roots
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(":");
        unsafe {
            std::env::set_var("COREAMP_LIBRARY_DIRS", joined);
        }
    }

    fn restore_library_roots() {
        unsafe {
            std::env::remove_var("COREAMP_LIBRARY_DIRS");
        }
    }

    static ENV_MUTEX: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn rejects_nonexistent_path() {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let outside = temp.path().join("does-not-exist.mp3");
        let err = validate_library_path(&outside).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("does not exist"), "got: {msg}");
        restore_library_roots();
    }

    #[test]
    fn accepts_path_inside_approved_root() {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let lib = make_root(&temp.path(), "library");
        configure_library_roots(&[lib.clone()]);
        let track = lib.join("track.mp3");
        std::fs::write(&track, b"fake").unwrap();
        let ok = validate_library_path(&track).unwrap();
        assert!(ok.ends_with("track.mp3"));
        restore_library_roots();
    }

    #[test]
    fn rejects_path_outside_approved_root() {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let lib = make_root(&temp.path(), "library");
        let other = make_root(&temp.path(), "other");
        configure_library_roots(&[other.clone()]);
        let track = lib.join("track.mp3");
        std::fs::write(&track, b"fake").unwrap();
        let err = validate_library_path(&track).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("outside approved roots"), "got: {msg}");
        restore_library_roots();
    }

    #[test]
    fn rejects_symlink_escape() {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        let temp = tempfile::tempdir().unwrap();
        let lib = make_root(&temp.path(), "library");
        let outside = temp.path().join("secret.txt");
        std::fs::write(&outside, b"top secret").unwrap();
        configure_library_roots(&[lib.clone()]);
        let symlink = lib.join("leak.txt");
        std::os::unix::fs::symlink(&outside, &symlink).unwrap();
        let err = validate_library_path(&symlink).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("outside approved roots"), "got: {msg}");
        restore_library_roots();
    }

    #[test]
    fn rejects_parent_traversal_segments() {
        let _guard = ENV_MUTEX.lock().unwrap_or_else(|e| e.into_inner());
        // Construct a path that contains `..` but doesn't exist; the
        // early "does not exist" branch is what we exercise here, since
        // canonicalize would also fail. The point is to confirm we
        // never let the raw path through.
        let temp = tempfile::tempdir().unwrap();
        let lib = make_root(&temp.path(), "library");
        configure_library_roots(&[lib.clone()]);
        let bad = lib.join("..").join("etc").join("passwd");
        let err = validate_library_path(&bad).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("does not exist"), "got: {msg}");
        restore_library_roots();
    }
}
