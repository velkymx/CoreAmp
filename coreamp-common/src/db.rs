use crate::error::CoreampError;
use crate::library::ScannedFile;
use crate::metadata::{self, TrackMetadata};
use crate::metadata_db_path;
use rusqlite::{Connection, OptionalExtension, params};
use std::collections::HashMap;
use std::collections::HashSet;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

static DB_CONN: OnceLock<Result<Mutex<Connection>, String>> = OnceLock::new();

// Enable WAL so readers don't block the writer (and the app/daemon don't trip
// over each other), and a busy timeout so concurrent access retries instead of
// failing with SQLITE_BUSY.
fn configure_connection(connection: &Connection) -> rusqlite::Result<()> {
    connection.query_row("PRAGMA journal_mode=WAL", [], |_| Ok(()))?;
    connection.busy_timeout(Duration::from_secs(5))?;
    Ok(())
}

fn get_db() -> Result<&'static Mutex<Connection>, CoreampError> {
    DB_CONN
        .get_or_init(|| {
            Connection::open(metadata_db_path())
                .map_err(|e| e.to_string())
                .and_then(|conn| {
                    configure_connection(&conn).map_err(|e| e.to_string())?;
                    apply_schema(&conn).map_err(|e| e.to_string())?;
                    Ok(Mutex::new(conn))
                })
        })
        .as_ref()
        .map_err(Clone::clone)
        .map_err(CoreampError::from)
}

#[derive(Debug, Clone)]
pub struct LibraryRow {
    pub path: String,
    pub filename: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_artist: Option<String>,
    pub title: Option<String>,
    pub year: Option<String>,
    pub genre: Option<String>,
    pub track_number: Option<i64>,
    pub liked: bool,
    pub duration_secs: Option<i64>,
    pub rating: i64,
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

/// Ordered list of schema migrations. Append a new entry when adding
/// a column or table; never edit an existing entry once it has
/// shipped (old DBs still need the original SQL to upgrade).
///
/// Each entry is `(&'static str version, &'static str sql)`. The
/// `sql` is run with `execute_batch` inside a transaction. Use
/// `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for
/// idempotency, but otherwise treat each entry as a snapshot of the
/// schema at that version.
const MIGRATIONS: &[(u32, &str)] = &[
    (
        1,
        r#"
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL UNIQUE,
            filename TEXT NOT NULL,
            artist TEXT,
            album TEXT,
            album_artist TEXT,
            title TEXT,
            track_number INTEGER,
            year TEXT,
            genre TEXT,
            liked INTEGER NOT NULL DEFAULT 0,
            rating INTEGER NOT NULL DEFAULT 0,
            play_count INTEGER NOT NULL DEFAULT 0,
            last_played_at INTEGER,
            cover_url TEXT,
            metadata_hash TEXT,
            duration_secs INTEGER,
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
        "#,
    ),
];

const LATEST_SCHEMA_VERSION: u32 = 1;

fn apply_schema(connection: &Connection) -> rusqlite::Result<()> {
    // Read the recorded version. PRAGMA user_version is part of the
    // SQLite file header and survives across opens; new DBs default
    // to 0. Each migration runs in a transaction so a partial apply
    // (crash, panic) leaves user_version unchanged and the migration
    // retries on next open.
    let current_version: u32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))?
        .try_into()
        .unwrap_or(0);

    if current_version > LATEST_SCHEMA_VERSION {
        // The DB was written by a newer build. Refuse to silently
        // downgrade; let the caller surface a clear error.
        return Err(rusqlite::Error::InvalidQuery);
    }

    for &(version, sql) in MIGRATIONS.iter() {
        if version <= current_version {
            continue;
        }
        let tx = connection.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version as i64)?;
        tx.commit()?;
    }

    Ok(())
}

pub fn init_metadata_db() -> Result<(), CoreampError> {
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
            INSERT INTO files(path, filename, artist, album, album_artist, title, year, genre, track_number, metadata_hash, duration_secs, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, unixepoch())
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
                album_artist = CASE
                    WHEN files.album_artist IS NULL OR files.album_artist = '' THEN excluded.album_artist
                    ELSE files.album_artist
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
                track_number = CASE
                    WHEN files.track_number IS NULL THEN excluded.track_number
                    ELSE files.track_number
                END,
                duration_secs = excluded.duration_secs,
                updated_at = unixepoch()
            "#,
        )?;

        for file in files {
            stmt.execute(params![
                file.path.to_string_lossy().to_string(),
                &file.filename,
                &file.artist,
                &file.album,
                &file.album_artist,
                &file.title,
                &file.year,
                &file.genre,
                &file.track_number,
                &file.metadata_hash,
                &file.duration_secs
            ])?;
        }
    }
    tx.commit()?;
    Ok(files.len())
}

pub fn upsert_scanned_files(files: &[ScannedFile]) -> Result<usize, CoreampError> {
    let mutex = get_db()?;
    let mut connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    upsert_scanned_files_with_connection(&mut connection, files).map_err(CoreampError::from)
}

pub fn list_library_files(
    limit: usize,
    offset: usize,
    genre_filter: Option<String>,
    liked_only: bool,
    search_term: Option<String>,
) -> Result<Vec<LibraryRow>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    list_library_files_with_connection(
        &connection,
        limit,
        offset,
        genre_filter,
        liked_only,
        search_term,
    )
}

/// The actual implementation, factored out so tests can drive it
/// against an in-memory `Connection` without touching the global
/// `OnceLock` DB. The query is built once with a static SQL string.
/// Each filter is expressed as `(<param> IS NULL OR <col> = <param>)`
/// so the same set of 5 bound parameters is used regardless of which
/// filters are active. This avoids the index-juggling trap of a
/// dynamic `?N` builder and removes any temptation to splice user
/// values into the SQL text.
pub(crate) fn list_library_files_with_connection(
    connection: &Connection,
    limit: usize,
    offset: usize,
    genre_filter: Option<String>,
    liked_only: bool,
    search_term: Option<String>,
) -> Result<Vec<LibraryRow>, CoreampError> {
    let mut stmt = connection.prepare(
        r#"
        SELECT path, filename, artist, album, title, year, genre, liked,
               duration_secs, album_artist, track_number, rating
        FROM files
        WHERE (?2 IS NULL OR genre = ?2)
          AND (?5 = 0 OR liked = 1)
          AND (?3 = '' OR artist LIKE ?3
                       OR album LIKE ?3
                       OR title LIKE ?3
                       OR filename LIKE ?3)
        ORDER BY
            COALESCE(artist, ''),
            COALESCE(album, ''),
            filename
        LIMIT ?1 OFFSET ?4
        "#,
    )?;

    let search_pattern = search_term
        .as_deref()
        .map(|s| format!("%{s}%"))
        .unwrap_or_default();

    let rows = stmt.query_map(
        params![
            limit as i64,
            genre_filter,
            search_pattern,
            offset as i64,
            liked_only as i64,
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
                duration_secs: row.get(8)?,
                album_artist: row.get(9)?,
                track_number: row.get(10)?,
                rating: row.get(11)?,
            })
        },
    )?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

fn library_row_from_row(row: &rusqlite::Row) -> rusqlite::Result<LibraryRow> {
    Ok(LibraryRow {
        path: row.get(0)?,
        filename: row.get(1)?,
        artist: row.get(2)?,
        album: row.get(3)?,
        title: row.get(4)?,
        year: row.get(5)?,
        genre: row.get(6)?,
        liked: row.get::<_, i32>(7)? != 0,
        duration_secs: row.get(8)?,
        album_artist: row.get(9)?,
        track_number: row.get(10)?,
        rating: row.get(11)?,
    })
}

/// All tracks belonging to an album, ordered by filename (which is usually
/// track-number-prefixed) then title. When `artist` is given, only that
/// artist's tracks on the album are returned (disambiguates same-named albums).
pub(crate) fn rows_for_album(
    conn: &Connection,
    album: &str,
    artist: Option<&str>,
) -> Result<Vec<LibraryRow>, CoreampError> {
    let mut query = String::from(
        r#"
        SELECT path, filename, artist, album, title, year, genre, liked, duration_secs, album_artist, track_number, rating
        FROM files
        WHERE album = ?1
        "#,
    );
    if artist.is_some() {
        query.push_str(" AND artist = ?2");
    }
    query.push_str(" ORDER BY track_number IS NULL, track_number, filename, COALESCE(title, '')");

    let mut stmt = conn.prepare(&query)?;
    let mapped = if let Some(artist) = artist {
        stmt.query_map(params![album, artist], library_row_from_row)
    } else {
        stmt.query_map(params![album], library_row_from_row)
    }?;

    let mut out = Vec::new();
    for row in mapped {
        out.push(row?);
    }
    Ok(out)
}

/// Public wrapper over [`rows_for_album`] using the shared DB connection.
pub fn list_album_tracks(
    album: &str,
    artist: Option<&str>,
) -> Result<Vec<LibraryRow>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    rows_for_album(&connection, album, artist)
}

pub fn toggle_liked(path: &str) -> Result<bool, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;

    let current_liked: i32 = connection
        .query_row(
            "SELECT liked FROM files WHERE path = ?1",
            params![path],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0);

    let new_liked = if current_liked == 0 { 1 } else { 0 };

    connection.execute(
        "UPDATE files SET liked = ?2, updated_at = unixepoch() WHERE path = ?1",
        params![path, new_liked],
    )?;

    Ok(new_liked != 0)
}

/// Set a track's 0–5 star rating (clamped). Returns the stored value.
pub fn set_rating(path: &str, rating: i64) -> Result<i64, CoreampError> {
    let clamped = rating.clamp(0, 5);
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    connection.execute(
        "UPDATE files SET rating = ?2, updated_at = unixepoch() WHERE path = ?1",
        params![path, clamped],
    )?;
    Ok(clamped)
}

pub fn list_all_genres() -> Result<Vec<String>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;

    let mut stmt = connection.prepare(
        r#"
            SELECT DISTINCT genre
            FROM files
            WHERE genre IS NOT NULL AND genre <> ''
            ORDER BY genre
            "#,
    )?;

    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn list_all_genre_summaries() -> Result<Vec<GenreSummary>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;

    let mut stmt = connection.prepare(
        r#"
            SELECT genre, COUNT(*), MIN(path)
            FROM files
            WHERE genre IS NOT NULL AND genre <> ''
            GROUP BY genre
            ORDER BY genre
            "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(GenreSummary {
            name: row.get(0)?,
            track_count: row.get::<_, i64>(1)? as usize,
            representative_path: row.get(2)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn list_all_artists() -> Result<Vec<ArtistSummary>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;

    let mut stmt = connection.prepare(
        r#"
            SELECT artist, COUNT(*), MIN(path)
            FROM files
            WHERE artist IS NOT NULL AND artist <> ''
            GROUP BY artist
            ORDER BY artist
            "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(ArtistSummary {
            name: row.get(0)?,
            track_count: row.get::<_, i64>(1)? as usize,
            representative_path: row.get(2)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn list_all_albums() -> Result<Vec<AlbumSummary>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;

    let mut stmt = connection.prepare(
        r#"
            SELECT album, artist, COUNT(*), MIN(path)
            FROM files
            WHERE album IS NOT NULL AND album <> ''
            GROUP BY album, artist
            ORDER BY album
            "#,
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(AlbumSummary {
            title: row.get(0)?,
            artist: row.get(1)?,
            track_count: row.get::<_, i64>(2)? as usize,
            representative_path: row.get(3)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn record_play(path: &str) -> Result<(), CoreampError> {
    let mutex = get_db()?;
    let mut connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let tx = connection.transaction()?;
    tx.execute(
        "UPDATE files SET play_count = play_count + 1, last_played_at = unixepoch() WHERE path = ?1",
        params![path],
    )
    ?;
    tx.execute(
        "INSERT INTO history (path, played_at) VALUES (?1, unixepoch())",
        params![path],
    )?;
    tx.commit().map_err(CoreampError::from)
}

fn rows_recently_added(connection: &Connection, limit: usize) -> rusqlite::Result<Vec<LibraryRow>> {
    let mut stmt = connection.prepare(
        r#"
        SELECT path, filename, artist, album, title, year, genre, liked, duration_secs, album_artist, track_number, rating
        FROM files
        ORDER BY updated_at DESC, id DESC
        LIMIT ?1
        "#,
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(LibraryRow {
            path: row.get(0)?,
            filename: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            title: row.get(4)?,
            year: row.get(5)?,
            genre: row.get(6)?,
            liked: row.get::<_, i32>(7)? != 0,
            duration_secs: row.get(8)?,
            album_artist: row.get(9)?,
            track_number: row.get(10)?,
            rating: row.get(11)?,
        })
    })?;
    rows.collect()
}

// Tracks most recently added/updated in the library (newest first).
pub fn list_recently_added(limit: usize) -> Result<Vec<LibraryRow>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    rows_recently_added(&connection, limit).map_err(CoreampError::from)
}

fn rows_recently_played(
    connection: &Connection,
    limit: usize,
) -> rusqlite::Result<Vec<LibraryRow>> {
    let mut stmt = connection.prepare(
        r#"
        SELECT f.path, f.filename, f.artist, f.album, f.title, f.year, f.genre, f.liked, f.duration_secs, f.album_artist, f.track_number, f.rating
        FROM files f
        JOIN (SELECT path, MAX(played_at) AS last_played FROM history GROUP BY path) h ON h.path = f.path
        ORDER BY h.last_played DESC
        LIMIT ?1
        "#,
    )?;
    let rows = stmt.query_map(params![limit as i64], library_row_from_row)?;
    rows.collect()
}

pub fn list_recently_played(limit: usize) -> Result<Vec<LibraryRow>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    rows_recently_played(&connection, limit).map_err(CoreampError::from)
}

pub fn list_top_artists(limit: usize) -> Result<Vec<ArtistSummary>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;

    let mut stmt = connection.prepare(
        r#"
            SELECT artist, SUM(play_count), MIN(path)
            FROM files
            WHERE artist IS NOT NULL AND artist <> '' AND play_count > 0
            GROUP BY artist
            ORDER BY SUM(play_count) DESC
            LIMIT ?1
            "#,
    )?;

    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(ArtistSummary {
            name: row.get(0)?,
            track_count: row.get::<_, i64>(1)? as usize,
            representative_path: row.get(2)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

pub fn clear_history() -> Result<(), CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let tx = connection.unchecked_transaction()?;

    tx.execute("DELETE FROM history", [])?;

    tx.execute("UPDATE files SET play_count = 0, last_played_at = NULL", [])?;

    tx.commit().map_err(CoreampError::from)
}

/// Delete library rows whose files no longer satisfy `exists` (e.g. removed
/// from disk). Also clears their play history. Returns the removed paths.
pub(crate) fn delete_missing_files<F: Fn(&str) -> bool>(
    conn: &Connection,
    exists: F,
) -> Result<Vec<String>, CoreampError> {
    let all_paths: Vec<String> = {
        let mut stmt = conn.prepare("SELECT path FROM files")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect::<Result<_, _>>()?
    };
    let missing: Vec<String> = all_paths.into_iter().filter(|p| !exists(p)).collect();

    let tx = conn.unchecked_transaction()?;
    for path in &missing {
        tx.execute("DELETE FROM files WHERE path = ?1", params![path])?;
        tx.execute("DELETE FROM history WHERE path = ?1", params![path])?;
    }
    tx.commit()?;
    Ok(missing)
}

/// Prune library entries whose backing files have been deleted from disk.
pub fn prune_missing_files() -> Result<Vec<String>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    delete_missing_files(&connection, |path| Path::new(path).exists())
}

pub fn library_count() -> Result<u64, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let count: i64 = connection.query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))?;
    Ok(count.max(0) as u64)
}

pub fn get_library_file(path: &str) -> Result<Option<LibraryRow>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let row = connection
        .query_row(
            r#"
            SELECT path, filename, artist, album, title, year, genre, liked, duration_secs, album_artist, track_number, rating
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
                    duration_secs: row.get(8)?,
                    album_artist: row.get(9)?,
                    track_number: row.get(10)?,
                    rating: row.get(11)?,
                })
            },
        )
        .optional()
        ?;
    Ok(row)
}

// SQLite caps bound parameters per statement; stay well under it per chunk.
const HASH_QUERY_CHUNK: usize = 500;

// Fetch metadata hashes for only the given paths (chunked IN query) instead of
// loading the whole `files` table into memory on every scan.
fn select_metadata_hashes(
    connection: &Connection,
    paths: &[String],
) -> rusqlite::Result<HashMap<String, String>> {
    let mut out = HashMap::with_capacity(paths.len());
    for chunk in paths.chunks(HASH_QUERY_CHUNK) {
        if chunk.is_empty() {
            continue;
        }
        let placeholders = vec!["?"; chunk.len()].join(",");
        let sql = format!(
            "SELECT path, metadata_hash FROM files \
             WHERE metadata_hash IS NOT NULL AND path IN ({placeholders})"
        );
        let mut stmt = connection.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(chunk.iter()), |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (path, hash) = row?;
            out.insert(path, hash);
        }
    }
    Ok(out)
}

pub fn metadata_hashes_for_paths(
    paths: &[String],
) -> Result<HashMap<String, String>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    select_metadata_hashes(&connection, paths).map_err(CoreampError::from)
}

pub fn backfill_duration_for_missing() -> Result<usize, CoreampError> {
    let mutex = get_db()?;

    // Read candidate paths under a short lock, then release it before any file
    // I/O so the slow per-file parse never blocks other DB users.
    let paths: Vec<String> = {
        let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
        let mut stmt = connection.prepare("SELECT path FROM files WHERE duration_secs IS NULL")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        let mut paths = Vec::new();
        for row in rows {
            paths.push(row?); // surface a malformed row instead of silently skipping it
        }
        paths
    };

    // Parse durations off-lock (the expensive part: opening + decoding files).
    let durations: Vec<(String, i64)> = paths
        .into_iter()
        .filter_map(|path| {
            metadata::read_track_metadata(Path::new(&path))
                .duration_secs
                .map(|duration| (path, duration))
        })
        .collect();

    // Write the results back under a short lock.
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let mut updated = 0;
    for (path, duration) in durations {
        // Propagate failures and count only rows actually written.
        updated += connection.execute(
            "UPDATE files SET duration_secs = ?1 WHERE path = ?2",
            params![duration, &path],
        )?;
    }

    Ok(updated)
}

pub fn metadata_hash_for_path(path: &Path) -> Result<Option<String>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let hash = connection
        .query_row(
            "SELECT metadata_hash FROM files WHERE path = ?1 LIMIT 1",
            params![path.to_string_lossy().to_string()],
            |row| row.get(0),
        )
        .optional()?;
    Ok(hash)
}

pub fn list_candidates_for_enrichment(
    limit: usize,
) -> Result<Vec<EnrichmentCandidate>, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let mut stmt = connection.prepare(
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
    )?;

    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(EnrichmentCandidate {
            path: row.get(0)?,
            query: row.get(1)?,
        })
    })?;

    let mut out = Vec::new();
    for row in rows {
        let candidate = row?;
        if !candidate.query.trim().is_empty() {
            out.push(candidate);
        }
    }
    Ok(out)
}

pub fn apply_enriched_metadata(path: &str, metadata: &TrackMetadata) -> Result<bool, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let changed = connection.execute(
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
    )?;
    Ok(changed > 0)
}

pub fn update_track_metadata(path: &str, metadata: &TrackMetadata) -> Result<bool, CoreampError> {
    let mutex = get_db()?;
    let connection = mutex.lock().map_err(|_| CoreampError::Lock)?;
    let changed = connection.execute(
        r#"
            UPDATE files
            SET
                artist = ?2,
                album = ?3,
                title = ?4,
                year = ?5,
                genre = ?6,
                album_artist = ?7,
                track_number = ?8,
                updated_at = unixepoch()
            WHERE path = ?1
            "#,
        params![
            path,
            &metadata.artist,
            &metadata.album,
            &metadata.title,
            &metadata.year,
            &metadata.genre,
            &metadata.album_artist,
            &metadata.track_number
        ],
    )?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use crate::library::ScannedFile;
    use rusqlite::Connection;
    use std::path::PathBuf;

    #[test]
    fn configure_connection_enables_wal() {
        let dir = std::env::temp_dir().join(format!("coreamp-wal-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("wal-test.db");
        let conn = Connection::open(&path).expect("open file db");
        super::configure_connection(&conn).expect("configure");
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("journal_mode");
        assert_eq!(mode.to_lowercase(), "wal");
        drop(conn);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn concurrent_connections_write_without_busy_errors() {
        // Two independently-opened connections (like the app + the daemon)
        // writing the same WAL DB at once must not fail with SQLITE_BUSY.
        let dir = std::env::temp_dir().join(format!("coreamp-multi-{}", std::process::id()));
        std::fs::create_dir_all(&dir).expect("temp dir");
        let path = dir.join("multi.db");

        {
            let conn = Connection::open(&path).expect("open");
            super::configure_connection(&conn).expect("configure");
            super::apply_schema(&conn).expect("schema");
        }

        let mut handles = Vec::new();
        for writer in 0..2 {
            let path = path.clone();
            handles.push(std::thread::spawn(move || {
                let conn = Connection::open(&path).expect("open");
                super::configure_connection(&conn).expect("configure");
                for i in 0..50 {
                    conn.execute(
                        "INSERT INTO files(path, filename) VALUES (?1, ?2)",
                        rusqlite::params![format!("/w{writer}/{i}.mp3"), "f.mp3"],
                    )
                    .expect("insert must not hit SQLITE_BUSY under WAL + busy_timeout");
                }
            }));
        }
        for handle in handles {
            handle.join().expect("writer thread");
        }

        let conn = Connection::open(&path).expect("reopen");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM files", [], |row| row.get(0))
            .expect("count");
        assert_eq!(count, 100);

        drop(conn);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn rows_recently_added_orders_by_updated_at_desc() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");
        // Insert with explicit updated_at so ordering is deterministic.
        for (path, updated) in [("/m/a.mp3", 100), ("/m/b.mp3", 300), ("/m/c.mp3", 200)] {
            conn.execute(
                "INSERT INTO files(path, filename, updated_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![path, "f.mp3", updated],
            )
            .expect("insert");
        }
        let rows = super::rows_recently_added(&conn, 10).expect("query");
        assert_eq!(
            rows.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
            vec!["/m/b.mp3", "/m/c.mp3", "/m/a.mp3"]
        );
    }

    #[test]
    fn rows_recently_added_respects_limit() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");
        for i in 0..5 {
            conn.execute(
                "INSERT INTO files(path, filename, updated_at) VALUES (?1, ?2, ?3)",
                rusqlite::params![format!("/m/{i}.mp3"), "f.mp3", i],
            )
            .expect("insert");
        }
        assert_eq!(
            super::rows_recently_added(&conn, 2).expect("query").len(),
            2
        );
    }

    #[test]
    fn rows_recently_played_maps_all_columns_including_album_artist() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");
        conn.execute(
            "INSERT INTO files(path, filename, album_artist) VALUES ('/m/a.mp3', 'a.mp3', 'VA')",
            [],
        )
        .expect("insert file");
        conn.execute(
            "INSERT INTO history(path, played_at) VALUES ('/m/a.mp3', 500)",
            [],
        )
        .expect("insert history");

        // Must not panic on "Invalid column index" — the SELECT and the row
        // mapper have to agree on the column count.
        let rows = super::rows_recently_played(&conn, 10).expect("query");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].path, "/m/a.mp3");
        assert_eq!(rows[0].album_artist.as_deref(), Some("VA"));
    }

    #[test]
    fn rating_column_round_trips_through_the_row_mapper() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");
        conn.execute(
            "INSERT INTO files(path, filename, rating, updated_at) VALUES ('/m/r.mp3', 'r.mp3', 4, 1)",
            [],
        )
        .expect("insert");
        // Reads the appended `rating` column (last index) — must agree with the
        // row mapper or it panics on an invalid column index.
        let rows = super::rows_recently_added(&conn, 10).expect("query");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].rating, 4);
    }

    #[test]
    fn upsert_persists_and_preserves_album_artist() {
        let mut conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");

        let with_aa = ScannedFile {
            path: PathBuf::from("/m/x.mp3"),
            filename: String::from("x.mp3"),
            artist: Some(String::from("Track Artist")),
            album: Some(String::from("Album")),
            album_artist: Some(String::from("Various Artists")),
            title: Some(String::from("Song")),
            year: None,
            genre: None,
            track_number: None,
            metadata_hash: String::from("h1"),
            duration_secs: None,
        };
        super::upsert_scanned_files_with_connection(&mut conn, &[with_aa]).expect("insert");

        let read: Option<String> = conn
            .query_row(
                "SELECT album_artist FROM files WHERE path = '/m/x.mp3'",
                [],
                |row| row.get(0),
            )
            .expect("select");
        assert_eq!(read.as_deref(), Some("Various Artists"));

        // A later scan with an empty album_artist must not clobber the stored one.
        let rescan = ScannedFile {
            path: PathBuf::from("/m/x.mp3"),
            filename: String::from("x.mp3"),
            artist: Some(String::from("Track Artist")),
            album: Some(String::from("Album")),
            album_artist: None,
            track_number: None,
            title: Some(String::from("Song")),
            year: None,
            genre: None,
            metadata_hash: String::from("h2"),
            duration_secs: None,
        };
        super::upsert_scanned_files_with_connection(&mut conn, &[rescan]).expect("rescan");
        let preserved: Option<String> = conn
            .query_row(
                "SELECT album_artist FROM files WHERE path = '/m/x.mp3'",
                [],
                |row| row.get(0),
            )
            .expect("select");
        assert_eq!(preserved.as_deref(), Some("Various Artists"));
    }

    #[test]
    fn rows_for_album_returns_album_tracks_ordered_and_artist_scoped() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");
        let rows = [
            ("/m/02.mp3", "Aurora", "Track Two", "02 - b.mp3"),
            ("/m/01.mp3", "Aurora", "Track One", "01 - a.mp3"),
            ("/m/other.mp3", "Other Artist", "Other Song", "song.mp3"),
        ];
        for (path, artist, title, filename) in rows {
            conn.execute(
                "INSERT INTO files(path, filename, artist, album, title) VALUES (?1, ?2, ?3, 'Skyline', ?4)",
                rusqlite::params![path, filename, artist, title],
            )
            .expect("insert");
        }

        // Whole album, ordered by filename.
        let all = super::rows_for_album(&conn, "Skyline", None).expect("album");
        assert_eq!(
            all.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
            vec!["/m/01.mp3", "/m/02.mp3", "/m/other.mp3"]
        );

        // Scoped to one artist.
        let scoped = super::rows_for_album(&conn, "Skyline", Some("Aurora")).expect("scoped");
        assert_eq!(
            scoped
                .iter()
                .map(|r| r.title.as_deref())
                .collect::<Vec<_>>(),
            vec![Some("Track One"), Some("Track Two")]
        );
    }

    #[test]
    fn delete_missing_files_removes_only_orphans() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("schema");
        for path in ["/m/keep.mp3", "/m/gone.mp3", "/m/also-gone.mp3"] {
            conn.execute(
                "INSERT INTO files(path, filename) VALUES (?1, ?2)",
                rusqlite::params![path, "f.mp3"],
            )
            .expect("insert");
        }
        // History rows for an orphan must be cleaned up too.
        conn.execute(
            "INSERT INTO history(path) VALUES (?1)",
            rusqlite::params!["/m/gone.mp3"],
        )
        .expect("insert history");

        let mut removed =
            super::delete_missing_files(&conn, |p| p == "/m/keep.mp3").expect("prune");
        removed.sort();
        assert_eq!(
            removed,
            vec![
                String::from("/m/also-gone.mp3"),
                String::from("/m/gone.mp3")
            ]
        );

        let remaining: Vec<String> = {
            let mut stmt = conn.prepare("SELECT path FROM files").unwrap();
            stmt.query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        assert_eq!(remaining, vec![String::from("/m/keep.mp3")]);

        let history_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM history", [], |row| row.get(0))
            .unwrap();
        assert_eq!(history_count, 0);
    }

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
            album_artist: None,
            track_number: None,
            title: Some(String::from("title-a")),
            year: None,
            genre: None,
            metadata_hash: String::from("hash-a"),
            duration_secs: None,
        };
        let second = ScannedFile {
            path: PathBuf::from("/tmp/a.mp3"),
            filename: String::from("renamed.mp3"),
            artist: Some(String::from("artist-b")),
            album: Some(String::from("album-b")),
            album_artist: None,
            track_number: None,
            title: Some(String::from("title-b")),
            year: Some(String::from("2026")),
            genre: Some(String::from("Genre B")),
            metadata_hash: String::from("hash-b"),
            duration_secs: Some(180),
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

    #[test]
    fn select_metadata_hashes_returns_only_requested_paths() {
        let mut conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("apply schema");

        let mk = |path: &str, hash: &str| ScannedFile {
            path: PathBuf::from(path),
            filename: String::from("f.mp3"),
            artist: None,
            album: None,
            album_artist: None,
            track_number: None,
            title: None,
            year: None,
            genre: None,
            metadata_hash: String::from(hash),
            duration_secs: None,
        };
        super::upsert_scanned_files_with_connection(
            &mut conn,
            &[
                mk("/m/a.mp3", "ha"),
                mk("/m/b.mp3", "hb"),
                mk("/m/c.mp3", "hc"),
            ],
        )
        .expect("seed rows");

        // Ask for a subset (one of which is unknown) — only the known scanned
        // paths come back, never the whole table.
        let got = super::select_metadata_hashes(
            &conn,
            &[
                String::from("/m/a.mp3"),
                String::from("/m/c.mp3"),
                String::from("/m/missing.mp3"),
            ],
        )
        .expect("select hashes");

        assert_eq!(got.len(), 2);
        assert_eq!(got.get("/m/a.mp3").map(String::as_str), Some("ha"));
        assert_eq!(got.get("/m/c.mp3").map(String::as_str), Some("hc"));
        assert!(!got.contains_key("/m/b.mp3"));
    }

    #[test]
    fn select_metadata_hashes_empty_input_is_empty() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("apply schema");
        let got = super::select_metadata_hashes(&conn, &[]).expect("select");
        assert!(got.is_empty());
    }

    #[test]
    fn list_library_files_binding_indices_match() {
        // Pins the parameter order: ?1 limit, ?2 genre_filter,
        // ?3 search_pattern, ?4 offset, ?5 liked_only. Reorder the
        // SQL parameters or the params![] and this test fails. Also
        // exercises every filter combination in one call so the
        // `(?2 IS NULL OR ...)` / `(?3 = '' OR ...)` / `(?5 = 0 OR ...)`
        // guards are all hit.
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("apply schema");
        for (i, (artist, album, title, genre, liked, fname)) in [
            ("Rock", "A", "X", "Rock", true, "x.mp3"),
            ("Pop", "B", "Y", "Pop", false, "y.mp3"),
            ("Rock", "C", "Z", "Rock", false, "z.mp3"),
        ]
        .iter()
        .enumerate()
        {
            conn.execute(
                "INSERT INTO files(path, filename, artist, album, title, genre, liked)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    format!("/m/{i}.mp3"),
                    *fname,
                    *artist,
                    *album,
                    *title,
                    *genre,
                    *liked,
                ],
            )
            .expect("insert");
        }

        // No filters: 3 rows.
        let all = super::list_library_files_with_connection(
            &conn, 100, 0, None, false, None,
        )
        .expect("list");
        assert_eq!(all.len(), 3);

        // genre=Rock + liked_only=true: 1 row (X).
        let rock_liked = super::list_library_files_with_connection(
            &conn, 100, 0, Some("Rock".to_string()), true, None,
        )
        .expect("list");
        assert_eq!(rock_liked.len(), 1);
        assert_eq!(rock_liked[0].title.as_deref(), Some("X"));

        // search=Pop: 1 row (Y).
        let pop = super::list_library_files_with_connection(
            &conn, 100, 0, None, false, Some("Pop".to_string()),
        )
        .expect("list");
        assert_eq!(pop.len(), 1);
        assert_eq!(pop[0].title.as_deref(), Some("Y"));

        // offset: skip first row, get 2.
        let offset = super::list_library_files_with_connection(
            &conn, 100, 1, None, false, None,
        )
        .expect("list");
        assert_eq!(offset.len(), 2);
    }

    #[test]
    fn apply_schema_records_user_version() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("apply schema");
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("user_version");
        assert_eq!(version, super::LATEST_SCHEMA_VERSION as i64);
    }

    #[test]
    fn apply_schema_idempotent_on_repeat() {
        let conn = Connection::open_in_memory().expect("in-memory db");
        super::apply_schema(&conn).expect("first apply");
        super::apply_schema(&conn).expect("second apply must be a no-op");
        // Still at latest version.
        let version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("user_version");
        assert_eq!(version, super::LATEST_SCHEMA_VERSION as i64);
    }

    #[test]
    fn apply_schema_rejects_newer_db() {
        // Simulate a DB that was opened and written by a future build
        // (user_version is beyond our latest). apply_schema must refuse
        // to silently downgrade.
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.pragma_update(None, "user_version", (super::LATEST_SCHEMA_VERSION + 1) as i64)
            .expect("bump user_version");
        let err = super::apply_schema(&conn).expect_err("must refuse downgrade");
        assert!(matches!(err, rusqlite::Error::InvalidQuery));
    }
}
