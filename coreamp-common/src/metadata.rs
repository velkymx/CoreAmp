use std::borrow::Cow;
use std::fs;
use std::path::{Path, PathBuf};

use lofty::config::WriteOptions;
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::prelude::{Accessor, AudioFile, TaggedFileExt};
use lofty::tag::ItemKey;
use lofty::tag::Tag;
use lofty::tag::items::Timestamp;

#[derive(Debug, Clone, Default)]
pub struct TrackMetadata {
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<u32>,
    pub duration_secs: Option<i64>,
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

/// Public view of the supported-image-type check, for the artwork-replace
/// command (None = unsupported extension).
pub fn supported_image_mime(path: &Path) -> Option<&'static str> {
    image_mime_type(path)
}

/// Replace a track's embedded cover art with the given image bytes. Removes any
/// existing front cover, writes the new one to the primary tag, and saves.
pub fn write_artwork(path: &Path, image: &[u8], mime: &str) -> Result<(), String> {
    if image.is_empty() {
        return Err(String::from("empty image data"));
    }
    let mime_type = MimeType::from_str(mime);

    let mut tagged_file = lofty::read_from_path(path).map_err(|err| err.to_string())?;
    if tagged_file.primary_tag_mut().is_none() {
        tagged_file.insert_tag(Tag::new(tagged_file.primary_tag_type()));
    }
    let tag = tagged_file
        .primary_tag_mut()
        .ok_or_else(|| String::from("no writable tag"))?;

    tag.remove_picture_type(PictureType::CoverFront);
    let picture = Picture::unchecked(image.to_vec())
        .pic_type(PictureType::CoverFront)
        .mime_type(mime_type)
        .build();
    tag.push_picture(picture);

    tagged_file
        .save_to_path(path, WriteOptions::default())
        .map_err(|err| err.to_string())
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

// Trim a tag value, treating empty/whitespace as absent. Generic so it accepts
// both borrowed accessor values (Cow) and owned Strings.
fn normalize<S: AsRef<str>>(value: Option<S>) -> Option<String> {
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
    if !is_present(&metadata.album_artist) {
        metadata.album_artist = normalize(tag.get_string(ItemKey::AlbumArtist).map(str::to_string));
    }
    if !is_present(&metadata.title) {
        metadata.title = normalize(tag.title());
    }
    if !is_present(&metadata.year) {
        metadata.year = tag.date().map(|date| date.year.to_string());
    }
    if !is_present(&metadata.genre) {
        metadata.genre = normalize(tag.genre());
    }
    if metadata.track_number.is_none() {
        metadata.track_number = tag.track();
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

    metadata.duration_secs = tagged_file
        .properties()
        .duration()
        .as_secs()
        .try_into()
        .ok();

    for tag in ordered_tags(&tagged_file) {
        fill_missing_metadata(&mut metadata, tag);
        if is_present(&metadata.artist)
            && is_present(&metadata.album)
            && is_present(&metadata.title)
            && is_present(&metadata.year)
            && is_present(&metadata.genre)
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

/// Parse a ReplayGain gain value like "-6.48 dB" / "3.21 DB" / "-6.48" into a
/// dB float. Returns None for blank/garbage values.
pub fn parse_replay_gain_db(value: &str) -> Option<f32> {
    let mut s = value.trim();
    if s.len() >= 2 && s[s.len() - 2..].eq_ignore_ascii_case("db") {
        s = s[..s.len() - 2].trim();
    }
    s.parse::<f32>().ok()
}

fn read_replay_gain_key(path: &Path, key: ItemKey) -> Option<f32> {
    let tagged_file = lofty::read_from_path(path).ok()?;
    for tag in ordered_tags(&tagged_file) {
        if let Some(value) = tag.get_string(key)
            && let Some(db) = parse_replay_gain_db(value)
        {
            return Some(db);
        }
    }
    None
}

/// Read the track ReplayGain (dB) from a file's tags, if present.
pub fn read_track_replay_gain(path: &Path) -> Option<f32> {
    read_replay_gain_key(path, ItemKey::ReplayGainTrackGain)
}

/// Read the album ReplayGain (dB) from a file's tags, if present.
pub fn read_album_replay_gain(path: &Path) -> Option<f32> {
    read_replay_gain_key(path, ItemKey::ReplayGainAlbumGain)
}

fn is_missing(value: Option<Cow<'_, str>>) -> bool {
    normalize(value).is_none()
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
        if is_missing(tag.genre())
            && let Some(genre) = metadata.genre.clone()
        {
            tag.set_genre(genre);
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

    let artist = normalize(metadata.artist.clone());
    let album = normalize(metadata.album.clone());
    let album_artist = normalize(metadata.album_artist.clone());
    let title = normalize(metadata.title.clone());
    let year = parse_year_timestamp(&normalize(metadata.year.clone()));
    let genre = normalize(metadata.genre.clone());

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

        let current_album_artist =
            normalize(tag.get_string(ItemKey::AlbumArtist).map(str::to_string));
        if current_album_artist != album_artist {
            match &album_artist {
                Some(value) => {
                    tag.insert_text(ItemKey::AlbumArtist, value.clone());
                }
                None => {
                    tag.remove_key(ItemKey::AlbumArtist);
                }
            }
            changed = true;
        }

        let current_title = normalize(tag.title());
        if current_title != title {
            tag.set_title(title.clone().unwrap_or_default());
            changed = true;
        }

        let current_year = tag.date();
        if current_year != year {
            if let Some(timestamp) = year {
                tag.set_date(timestamp);
                changed = true;
            } else if current_year.is_some() {
                tag.remove_date();
                changed = true;
            }
        }

        let current_genre = normalize(tag.genre());
        if current_genre != genre {
            tag.set_genre(genre.clone().unwrap_or_default());
            changed = true;
        }

        let track_number = metadata.track_number;
        if tag.track() != track_number {
            match track_number {
                Some(value) => tag.set_track(value),
                None => tag.remove_track(),
            }
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

#[cfg(test)]
mod tests {
    use super::{directory_artwork_candidates, parse_replay_gain_db};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parse_replay_gain_db_handles_units_and_signs() {
        assert_eq!(parse_replay_gain_db("-6.48 dB"), Some(-6.48));
        assert_eq!(parse_replay_gain_db("3.21 DB"), Some(3.21));
        assert_eq!(parse_replay_gain_db("  +0.00 dB "), Some(0.0));
        assert_eq!(parse_replay_gain_db("-6.48"), Some(-6.48));
    }

    #[test]
    fn parse_replay_gain_db_rejects_garbage() {
        assert_eq!(parse_replay_gain_db(""), None);
        assert_eq!(parse_replay_gain_db("loud"), None);
        assert_eq!(parse_replay_gain_db("dB"), None);
    }

    fn temp_dir() -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("coreamp-art-{stamp}"));
        fs::create_dir_all(&dir).expect("temp dir");
        dir
    }

    #[test]
    fn directory_artwork_candidates_finds_sibling_cover() {
        let dir = temp_dir();
        fs::write(dir.join("song.mp3"), b"x").expect("track");
        fs::write(dir.join("cover.jpg"), b"jpgbytes").expect("cover");
        let candidates = directory_artwork_candidates(&dir.join("song.mp3"));
        assert!(
            candidates
                .iter()
                .any(|p| p.file_name().unwrap() == "cover.jpg"),
            "folder cover.jpg should be an artwork candidate"
        );
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn directory_artwork_candidates_empty_without_images() {
        let dir = temp_dir();
        fs::write(dir.join("song.mp3"), b"x").expect("track");
        fs::write(dir.join("notes.txt"), b"x").expect("txt");
        let candidates = directory_artwork_candidates(&dir.join("song.mp3"));
        assert!(
            candidates
                .iter()
                .all(|p| p.extension().is_some_and(|e| e != "txt"))
        );
        fs::remove_dir_all(&dir).ok();
    }
}
