use crate::library::ScannedFile;
use crate::metadata::TrackMetadata;
use crate::metadata_db_path;
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct LibraryRow {
    pub path: String,
    pub filename: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
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
    cover_url TEXT,
    metadata_hash TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
"#;

fn apply_schema(connection: &Connection) -> rusqlite::Result<()> {
    connection.execute_batch(SCHEMA)
}

pub fn init_metadata_db() -> Result<(), String> {
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())
}

fn upsert_scanned_files_with_connection(
    connection: &mut Connection,
    files: &[ScannedFile],
) -> rusqlite::Result<usize> {
    apply_schema(connection)?;
    let tx = connection.transaction()?;
    {
        let mut stmt = tx.prepare(
            r#"
            INSERT INTO files(path, filename, artist, album, title, year, metadata_hash, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, unixepoch())
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
                &file.metadata_hash
            ])?;
        }
    }
    tx.commit()?;
    Ok(files.len())
}

pub fn upsert_scanned_files(files: &[ScannedFile]) -> Result<usize, String> {
    let mut connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    upsert_scanned_files_with_connection(&mut connection, files).map_err(|err| err.to_string())
}

pub fn list_library_files(limit: usize) -> Result<Vec<LibraryRow>, String> {
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;

    let mut stmt = connection
        .prepare(
            r#"
            SELECT path, filename, artist, album, title, year
            FROM files
            ORDER BY
                COALESCE(artist, ''),
                COALESCE(album, ''),
                filename
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
            })
        })
        .map_err(|err| err.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|err| err.to_string())?);
    }
    Ok(out)
}

pub fn library_count() -> Result<u64, String> {
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;
    let count: i64 = connection
        .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
        .map_err(|err| err.to_string())?;
    Ok(count.max(0) as u64)
}

pub fn get_library_file(path: &str) -> Result<Option<LibraryRow>, String> {
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;
    let row = connection
        .query_row(
            r#"
            SELECT path, filename, artist, album, title, year
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
                })
            },
        )
        .optional()
        .map_err(|err| err.to_string())?;
    Ok(row)
}

pub fn metadata_hash_for_path(path: &Path) -> Result<Option<String>, String> {
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;
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
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;
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
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;
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
    let connection = Connection::open(metadata_db_path()).map_err(|err| err.to_string())?;
    apply_schema(&connection).map_err(|err| err.to_string())?;
    let changed = connection
        .execute(
            r#"
            UPDATE files
            SET
                artist = ?2,
                album = ?3,
                title = ?4,
                year = ?5,
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
            metadata_hash: String::from("hash-a"),
        };
        let second = ScannedFile {
            path: PathBuf::from("/tmp/a.mp3"),
            filename: String::from("renamed.mp3"),
            artist: Some(String::from("artist-b")),
            album: Some(String::from("album-b")),
            title: Some(String::from("title-b")),
            year: Some(String::from("2026")),
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
