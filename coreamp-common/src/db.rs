use crate::library::ScannedFile;
use crate::metadata::TrackMetadata;
use crate::metadata_db_path;
use rusqlite::{Connection, OptionalExtension, params};
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

static DB_CONN: OnceLock<Result<Mutex<Connection>, String>> = OnceLock::new();

fn get_db() -> Result<&'static Mutex<Connection>, String> {
    DB_CONN
        .get_or_init(|| {
            Connection::open(metadata_db_path())
                .map_err(|e| e.to_string())
                .and_then(|conn| {
                    apply_schema(&conn).map_err(|e| e.to_string())?;
                    Ok(Mutex::new(conn))
                })
        })
        .as_ref()
        .map_err(Clone::clone)
}

#[derive(Debug, Clone)]
pub struct LibraryRow {
    pub path: String,
    pub filename: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub liked: bool,
}

#[derive(Debug, Clone)]
pub struct ArtistSummary {
    pub name: String,
    pub track_count: usize,
    pub representative_path: String,
}

#[derive(Debug, Clone)]
pub struct AlbumSummary {
    pub title: String,
    pub artist: Option<String>,
    pub track_count: usize,
    pub representative_path: String,
}

#[derive(Debug, Clone)]
pub struct GenreSummary {
    pub name: String,
    pub track_count: usize,
    pub representative_path: String,
}

#[derive(Debug, Clone)]
pub struct EnrichmentCandidate {
    pub path: String,
    pub query: String,
}

const SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    artist TEXT,
    album TEXT,
    title TEXT,
    year TEXT,
    genre TEXT,
    liked INTEGER NOT NULL DEFAULT 0,
    play_count INTEGER NOT NULL DEFAULT 0,
    last_played_at INTEGER,
    cover_url TEXT,
    metadata_hash TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL,
    played_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
CREATE INDEX IF NOT EXISTS idx_files_artist ON files(artist);
CREATE INDEX IF NOT EXISTS idx_files_album ON files(album);
CREATE INDEX IF NOT EXISTS idx_files_liked ON files(liked);
CREATE INDEX IF NOT EXISTS idx_history_path ON history(path);
CREATE INDEX IF NOT EXISTS idx_history_played_at ON history(played_at);
"#;

fn apply_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(SCHEMA)?;

    // Migration for genre, liked, play_count, and last_played_at columns
    let columns = connection
        .prepare("PRAGMA table_info(files)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<HashSet<String>, _>>()?;

    if !columns.contains("genre") {
        connection.execute("ALTER TABLE files ADD COLUMN genre TEXT", [])?;
    }
    if !columns.contains("liked") {
        connection.execute(
            "ALTER TABLE files ADD COLUMN liked INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    if !columns.contains("play_count") {
        connection.execute(
            "ALTER TABLE files ADD COLUMN play_count INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    if !columns.contains("last_played_at") {
        connection.execute("ALTER TABLE files ADD COLUMN last_played_at INTEGER", [])?;
    }

    Ok(())
}

pub fn init_metadata_db() -> Result<(), String> {
    get_db().map(|_| ())
}

fn upsert_scanned_files_with_connection(
    connection: &mut Connection,
    files: &[ScannedFile],
) -> rusqlite::Result<usize> {
    let tx = connection.transaction()?;
    {
        let mut stmt = tx.prepare(
            r#"
            INSERT INTO files(path, filename, artist, album, title, year, genre, metadata_hash, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, unixepoch())
            ON CONFLICT(path) DO UPDATE SET
                filename = excluded.filename,
                metadata_hash = excluded.metadata_hash,
                artist = CASE
                    WHEN files.artist IS NULL OR files.artist = '' THEN excluded.artist
                    ELSE files.artist
                END,
                album = CASE
                    WHEN files.album IS NULL OR files.album = '' THEN excluded.album
                    ELSE files.album
                END,
                title = CASE
                    WHEN files.title IS NULL OR files.title = '' THEN excluded.title
                    ELSE files.title
                END,
                year = CASE
                    WHEN files.year IS NULL OR files.year = '' THEN excluded.year
                    ELSE files.year
                END,
                genre = CASE
                    WHEN files.genre IS NULL OR files.genre = '' THEN excluded.genre
                    ELSE files.genre
                END,
                updated_at = unixepoch()
            "#,
        )?;

        for file in files {
            stmt.execute(params![
                file.path.to_string_lossy().to_string(),
                &file.filename,
                &file.artist,
                &file.album,
                &file.title,
                &file.year,
                &file.genre,
                &file.metadata_hash
            ])?;
        }
    }
    tx.commit()?;
    Ok(files.len())
}

pub fn upsert_scanned_files(files: &[ScannedFile]) -> Result<usize, String> {
    let mutex = get_db()?;
    let mut connection = mutex.lock().map_err(|err| err.to_string())?;
    upsert_scanned_files_with_connection(&mut connection, files).map_err(|err| err.to_string())
}

pub fn list_library_files(
    limit: usize,
    offset: usize,
    genre_filter: Option<String>,
    liked_only: bool,
    search_term: Option<String>,
) -> Result<Vec<LibraryRow>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut query = String::from(
        r#"
        SELECT path, filename, artist, album, title, year, genre, liked
        FROM files
        WHERE 1=1
        "#,
    );

    if genre_filter.is_some() {
        query.push_str(" AND genre = ?2");
    }
    if liked_only {
        query.push_str(" AND liked = 1");
    }
    if search_term.is_some() {
        query.push_str(
            " AND (artist LIKE ?3 OR album LIKE ?3 OR title LIKE ?3 OR filename LIKE ?3)",
        );
    }

    query.push_str(
        r#"
        ORDER BY
            COALESCE(artist, ''),
            COALESCE(album, ''),
            filename
        LIMIT ?1 OFFSET ?4
        "#,
    );

    let mut stmt = connection.prepare(&query).map_err(|err| err.to_string())?;

    let search_pattern = search_term.map(|s| format!("%{s}%")).unwrap_or_default();

    let rows = stmt
        .query_map(
            params![
                limit as i64,
                genre_filter.unwrap_or_default(),
                search_pattern,
                offset as i64,
            ],
            |row| {
                Ok(LibraryRow {
                    path: row.get(0)?,
                    filename: row.get(1)?,
                    artist: row.get(2)?,
                    album: row.get(3)?,
                    title: row.get(4)?,
                    year: row.get(5)?,
                    genre: row.get(6)?,
                    liked: row.get::<_, i32>(7)? != 0,
                })
            },
        )
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn toggle_liked(path: &str) -> Result<bool, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let current_liked: i32 = connection
        .query_row(
            "SELECT liked FROM files WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .unwrap_or(0);

    let new_liked = if current_liked == 0 { 1 } else { 0 };

    connection
        .execute(
            "UPDATE files SET liked = ?2, updated_at = unixepoch() WHERE path = ?1",
            params![path, new_liked],
        )
        .map_err(|err| err.to_string())?;

    Ok(new_liked != 0)
}

pub fn list_all_genres() -> Result<Vec<String>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT DISTINCT genre
            FROM files
            WHERE genre IS NOT NULL AND genre <> ''
            ORDER BY genre
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn list_all_genre_summaries() -> Result<Vec<GenreSummary>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT genre, COUNT(*), MIN(path)
            FROM files
            WHERE genre IS NOT NULL AND genre <> ''
            GROUP BY genre
            ORDER BY genre
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(GenreSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1)? as usize,
                representative_path: row.get(2)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn list_all_artists() -> Result<Vec<ArtistSummary>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT artist, COUNT(*), MIN(path)
            FROM files
            WHERE artist IS NOT NULL AND artist <> ''
            GROUP BY artist
            ORDER BY artist
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ArtistSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1)? as usize,
                representative_path: row.get(2)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn list_all_albums() -> Result<Vec<AlbumSummary>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT album, artist, COUNT(*), MIN(path)
            FROM files
            WHERE album IS NOT NULL AND album <> ''
            GROUP BY album, artist
            ORDER BY album
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AlbumSummary {
                title: row.get(0)?,
                artist: row.get(1)?,
                track_count: row.get::<_, i64>(2)? as usize,
                representative_path: row.get(3)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn record_play(path: &str) -> Result<(), String> {
    let mutex = get_db()?;
    let mut connection = mutex.lock().map_err(|err| err.to_string())?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE files SET play_count = play_count + 1, last_played_at = unixepoch() WHERE path = ?1",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO history (path, played_at) VALUES (?1, unixepoch())",
        params![path],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

pub fn list_recently_played(limit: usize) -> Result<Vec<LibraryRow>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT f.path, f.filename, f.artist, f.album, f.title, f.year, f.genre, f.liked
            FROM files f
            JOIN (SELECT path, MAX(played_at) AS last_played FROM history GROUP BY path) h ON h.path = f.path
            ORDER BY h.last_played DESC
            LIMIT ?1
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![limit as i64], |row| {
            Ok(LibraryRow {
                path: row.get(0)?,
                filename: row.get(1)?,
                artist: row.get(2)?,
                album: row.get(3)?,
                title: row.get(4)?,
                year: row.get(5)?,
                genre: row.get(6)?,
                liked: row.get::<_, i32>(7)? != 0,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn list_top_artists(limit: usize) -> Result<Vec<ArtistSummary>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT artist, SUM(play_count), MIN(path)
            FROM files
            WHERE artist IS NOT NULL AND artist <> '' AND play_count > 0
            GROUP BY artist
            ORDER BY SUM(play_count) DESC
            LIMIT ?1
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![limit as i64], |row| {
            Ok(ArtistSummary {
                name: row.get(0)?,
                track_count: row.get::<_, i64>(1)? as usize,
                representative_path: row.get(2)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn clear_history() -> Result<(), String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let tx = connection
        .unchecked_transaction()
        .map_err(|err| err.to_string())?;

    tx.execute("DELETE FROM history", [])
        .map_err(|err| err.to_string())?;

    tx.execute("UPDATE files SET play_count = 0, last_played_at = NULL", [])
        .map_err(|err| err.to_string())?;

    tx.commit().map_err(|err| err.to_string())
}

pub fn library_count() -> Result<u64, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    Ok(count.max(0) as u64)
}

pub fn get_library_file(path: &str) -> Result<Option<LibraryRow>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let row = connection
        .query_row(
            r#"
            SELECT path, filename, artist, album, title, year, genre, liked
            FROM files
            WHERE path = ?1
            LIMIT 1
            "#,
            params![path],
            |row| {
                Ok(LibraryRow {
                    path: row.get(0)?,
                    filename: row.get(1)?,
                    artist: row.get(2)?,
                    album: row.get(3)?,
                    title: row.get(4)?,
                    year: row.get(5)?,
                    genre: row.get(6)?,
                    liked: row.get::<_, i32>(7)? != 0,
                })
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;
    Ok(row)
}

pub fn get_all_metadata_hashes() -> Result<HashMap<String, String>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare("SELECT path, metadata_hash FROM files WHERE metadata_hash IS NOT NULL")
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|err| err.to_string())?;

    let mut out = HashMap::new();
    for row in rows {
        let (path, hash) = row.map_err(|err| err.to_string())?;
        out.insert(path, hash);
    }
    Ok(out)
}

pub fn metadata_hash_for_path(path: &Path) -> Result<Option<String>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let hash = connection
        .query_row(
            "SELECT metadata_hash FROM files WHERE path = ?1 LIMIT 1",
            params![path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .optional()
        .map_err(|err| err.to_string())?;
    Ok(hash)
}

pub fn list_candidates_for_enrichment(limit: usize) -> Result<Vec<EnrichmentCandidate>, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let mut stmt = connection
        .prepare(
            r#"
            SELECT
                path,
                COALESCE(NULLIF(title, ''), NULLIF(filename, ''), '')
            FROM files
            WHERE
                (artist IS NULL OR artist = '')
                OR (album IS NULL OR album = '')
                OR (year IS NULL OR year = '')
            ORDER BY updated_at ASC
            LIMIT ?1
            "#,
        )
        .map_err(|err| err.to_string())?;

    let rows = stmt
        .query_map(params![limit as i64], |row| {
            Ok(EnrichmentCandidate {
                path: row.get(0)?,
                query: row.get(1)?,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        let candidate = row.map_err(|err| err.to_string())?;
        if !candidate.query.trim().is_empty() {
            out.push(candidate);
        }
    }
    Ok(out)
}

pub fn apply_enriched_metadata(path: &str, metadata: &TrackMetadata) -> Result<bool, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let changed = connection
        .execute(
            r#"
            UPDATE files
            SET
                artist = CASE
                    WHEN (artist IS NULL OR artist = '') AND ?2 IS NOT NULL AND ?2 <> '' THEN ?2
                    ELSE artist
                END,
                album = CASE
                    WHEN (album IS NULL OR album = '') AND ?3 IS NOT NULL AND ?3 <> '' THEN ?3
                    ELSE album
                END,
                title = CASE
                    WHEN (title IS NULL OR title = '') AND ?4 IS NOT NULL AND ?4 <> '' THEN ?4
                    ELSE title
                END,
                year = CASE
                    WHEN (year IS NULL OR year = '') AND ?5 IS NOT NULL AND ?5 <> '' THEN ?5
                    ELSE year
                END,
                updated_at = unixepoch()
            WHERE path = ?1
            "#,
            params![
                path,
                &metadata.artist,
                &metadata.album,
                &metadata.title,
                &metadata.year
            ],
        )
        .map_err(|err| err.to_string())?;
    Ok(changed > 0)
}

pub fn update_track_metadata(path: &str, metadata: &TrackMetadata) -> Result<bool, String> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|err| err.to_string())?;
    let changed = connection
        .execute(
            r#"
            UPDATE files
            SET
                artist = ?2,
                album = ?3,
                title = ?4,
                year = ?5,
                genre = ?6,
                updated_at = unixepoch()
            WHERE path = ?1
            "#,
            params![
                path,
                &metadata.artist,
                &metadata.album,
                &metadata.title,
                &metadata.year,
                &metadata.genre
            ],
        )
        .map_err(|err| err.to_string())?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use crate::library::ScannedFile;
    use rusqlite::Connection;
    use std::path::PathBuf;

    #[test]
    fn schema_contains_files_table() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("apply schema");
        let table_name: String = conn
            .query_row(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='files'",
                [],
                |row| row.get(0),
            )
            .expect("files table exists");
        assert_eq!(table_name, "files");
    }

    #[test]
    fn upsert_updates_existing_path() {
        let mut conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("apply schema");

        let first = ScannedFile {
            path: PathBuf::from("/tmp/a.mp3"),
            filename: String::from("a.mp3"),
            artist: Some(String::from("artist-a")),
            album: None,
            title: Some(String::from("title-a")),
            year: None,
            genre: None,
            metadata_hash: String::from("hash-a"),
        };
        let second = ScannedFile {
            path: PathBuf::from("/tmp/a.mp3"),
            filename: String::from("renamed.mp3"),
            artist: Some(String::from("artist-b")),
            album: Some(String::from("album-b")),
            title: Some(String::from("title-b")),
            year: Some(String::from("2026")),
            genre: Some(String::from("Genre B")),
            metadata_hash: String::from("hash-b"),
        };
        super::upsert_scanned_files_with_connection(&mut conn, &[first, second])
            .expect("upsert rows");

        let (filename, metadata_hash): (String, Option<String>) = conn
            .query_row(
                "SELECT filename, metadata_hash FROM files WHERE path = '/tmp/a.mp3'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("select row");

        assert_eq!(filename, "renamed.mp3");
        assert_eq!(metadata_hash.as_deref(), Some("hash-b"));
    }
}
