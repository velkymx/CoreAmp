use std::borrow::Cow;
use std::fs;
use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::picture::PictureType;
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::tag::Tag;
use lofty::tag::items::Timestamp;

#[derive(Debug, Clone, Default)]
pub struct TrackMetadata {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
}

#[derive(Debug, Clone)]
pub struct EmbeddedArtwork {
    pub mime_type: String,
    pub data: Vec<u8>,
}

fn image_mime_type(path: &Path) -> Option<&'static str> {
    let extension = path.extension()?.to_string_lossy().to_ascii_lowercase();
    match extension.as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        _ => None,
    }
}

fn read_artwork_file(path: &Path) -> Option<EmbeddedArtwork> {
    let mime_type = image_mime_type(path)?.to_string();
    let data = fs::read(path).ok()?;
    if data.is_empty() {
        return None;
    }
    Some(EmbeddedArtwork { mime_type, data })
}

fn directory_artwork_candidates(track_path: &Path) -> Vec<PathBuf> {
    let Some(parent) = track_path.parent() else {
        return Vec::new();
    };

    let mut candidates = Vec::new();
    for base_name in ["cover", "folder", "front", "album", "artwork"] {
        for extension in ["jpg", "jpeg", "png", "webp"] {
            candidates.push(parent.join(format!("{base_name}.{extension}")));
        }
    }

    if let Ok(entries) = fs::read_dir(parent) {
        let mut discovered = entries
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| image_mime_type(path).is_some())
            .filter(|path| {
                let file_name = path
                    .file_name()
                    .map(|value| value.to_string_lossy().to_ascii_lowercase())
                    .unwrap_or_default();
                file_name.contains("albumart")
                    || file_name.contains("cover")
                    || file_name.contains("folder")
                    || file_name.contains("front")
            })
            .collect::<Vec<_>>();
        discovered.sort();
        candidates.extend(discovered);
    }

    candidates
}

fn read_directory_artwork(track_path: &Path) -> Option<EmbeddedArtwork> {
    for candidate in directory_artwork_candidates(track_path) {
        if let Some(artwork) = read_artwork_file(&candidate) {
            return Some(artwork);
        }
    }
    None
}

fn normalize(value: Option<Cow<'_, str>>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.as_ref().trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn is_present(value: &Option<String>) -> bool {
    value.as_ref().is_some_and(|value| !value.trim().is_empty())
}

fn ordered_tags(tagged_file: &impl TaggedFileExt) -> Vec<&Tag> {
    let mut tags = Vec::new();

    if let Some(primary) = tagged_file.primary_tag() {
        tags.push(primary);
    }
    if let Some(first) = tagged_file.first_tag()
        && !tags.iter().any(|existing| std::ptr::eq(*existing, first))
    {
        tags.push(first);
    }
    for tag in tagged_file.tags() {
        if !tags.iter().any(|existing| std::ptr::eq(*existing, tag)) {
            tags.push(tag);
        }
    }

    tags
}

fn fill_missing_metadata(metadata: &mut TrackMetadata, tag: &Tag) {
    if !is_present(&metadata.artist) {
        metadata.artist = normalize(tag.artist());
    }
    if !is_present(&metadata.album) {
        metadata.album = normalize(tag.album());
    }
    if !is_present(&metadata.title) {
        metadata.title = normalize(tag.title());
    }
    if !is_present(&metadata.year) {
        metadata.year = tag.date().map(|date| date.year.to_string());
    }
}

fn artwork_from_tag(tag: &Tag) -> Option<EmbeddedArtwork> {
    let picture = tag
        .get_picture_type(PictureType::CoverFront)
        .or_else(|| tag.pictures().first())?;
    let mime_type = picture.mime_type()?.as_str().to_string();
    let data = picture.data();
    if data.is_empty() {
        return None;
    }
    Some(EmbeddedArtwork {
        mime_type,
        data: data.to_vec(),
    })
}

pub fn read_track_metadata(path: &Path) -> TrackMetadata {
    let mut metadata = TrackMetadata::default();

    let tagged_file = match lofty::read_from_path(path) {
        Ok(file) => file,
        Err(_) => return metadata,
    };

    for tag in ordered_tags(&tagged_file) {
        fill_missing_metadata(&mut metadata, tag);
        if is_present(&metadata.artist)
            && is_present(&metadata.album)
            && is_present(&metadata.title)
            && is_present(&metadata.year)
        {
            break;
        }
    }

    metadata
}

pub fn read_track_artwork(path: &Path) -> Option<EmbeddedArtwork> {
    if let Ok(tagged_file) = lofty::read_from_path(path) {
        for tag in ordered_tags(&tagged_file) {
            if let Some(artwork) = artwork_from_tag(tag) {
                return Some(artwork);
            }
        }
    }
    read_directory_artwork(path)
}

fn is_missing(value: Option<Cow<'_, str>>) -> bool {
    match value {
        None => true,
        Some(text) => text.trim().is_empty(),
    }
}

fn normalize_owned(value: Option<String>) -> Option<String> {
    value.and_then(|raw| {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn parse_year_timestamp(value: &Option<String>) -> Option<Timestamp> {
    value
        .as_ref()
        .and_then(|raw| raw.trim().parse::<u16>().ok())
        .map(|year| Timestamp {
            year,
            ..Timestamp::default()
        })
}

pub fn write_missing_tags(path: &Path, metadata: &TrackMetadata) -> Result<bool, String> {
    let mut tagged_file = lofty::read_from_path(path).map_err(|err| err.to_string())?;

    if tagged_file.primary_tag_mut().is_none() {
        tagged_file.insert_tag(Tag::new(tagged_file.primary_tag_type()));
    }

    let mut changed = false;
    if let Some(tag) = tagged_file.primary_tag_mut() {
        if is_missing(tag.artist())
            && let Some(artist) = metadata.artist.clone()
        {
            tag.set_artist(artist);
            changed = true;
        }
        if is_missing(tag.album())
            && let Some(album) = metadata.album.clone()
        {
            tag.set_album(album);
            changed = true;
        }
        if is_missing(tag.title())
            && let Some(title) = metadata.title.clone()
        {
            tag.set_title(title);
            changed = true;
        }
        if tag.date().is_none()
            && let Some(timestamp) = parse_year_timestamp(&metadata.year)
        {
            tag.set_date(timestamp);
            changed = true;
        }
    }

    if changed {
        tagged_file
            .save_to_path(path, WriteOptions::default())
            .map_err(|err| err.to_string())?;
    }

    Ok(changed)
}

pub fn write_tags(path: &Path, metadata: &TrackMetadata) -> Result<bool, String> {
    let mut tagged_file = lofty::read_from_path(path).map_err(|err| err.to_string())?;

    if tagged_file.primary_tag_mut().is_none() {
        tagged_file.insert_tag(Tag::new(tagged_file.primary_tag_type()));
    }

    let artist = normalize_owned(metadata.artist.clone());
    let album = normalize_owned(metadata.album.clone());
    let title = normalize_owned(metadata.title.clone());
    let year = parse_year_timestamp(&normalize_owned(metadata.year.clone()));

    let mut changed = false;
    if let Some(tag) = tagged_file.primary_tag_mut() {
        let current_artist = normalize(tag.artist());
        if current_artist != artist {
            tag.set_artist(artist.clone().unwrap_or_default());
            changed = true;
        }

        let current_album = normalize(tag.album());
        if current_album != album {
            tag.set_album(album.clone().unwrap_or_default());
            changed = true;
        }

        let current_title = normalize(tag.title());
        if current_title != title {
            tag.set_title(title.clone().unwrap_or_default());
            changed = true;
        }

        let current_year = tag.date();
        if current_year != year
            && let Some(timestamp) = year
        {
            tag.set_date(timestamp);
            changed = true;
        }
    }

    if changed {
        tagged_file
            .save_to_path(path, WriteOptions::default())
            .map_err(|err| err.to_string())?;
    }

    Ok(changed)
}
