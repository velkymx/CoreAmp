# CoreAmp TODO

Forward-looking only. Completed work (Phases 0–4, the audiophile roadmap P0/P1,
the UI redesign, and the Vue/VibeUI migration) has moved to `CHANGELOG.md`.

Reference: legacy-vs-new gap analysis 2026-06-03; specs/plans in
`docs/superpowers/`.

---

## Frontend gaps vs the legacy UI

### Visualizer
- [ ] Port the remaining three.js reactive modes: **Vortex**, **Nebula**,
      **Storm** (legacy had 6 modes; new has Bars/Spectrum/Oscilloscope/Orb).

### Audio / EQ
- [ ] Save / delete **named user EQ presets** (localStorage; no backend needed).
- [ ] Apply **boost / limiter / crossfeed** to the web audio path (currently
      only EQ + preamp affect the sound).

### Player UI
- [ ] Expanded "showcase" player view (big now-playing with its own transport).
- [ ] Light / dark **theme toggle** in-app.

### Library / metadata
- [ ] Track-info sidebar (album art, year, tracklist).
- [ ] Album-centric browsing (play in album order).
- [ ] Expanded metadata editing (album artist / track no. / disc no. /
      composer / genre).
- [ ] Search sort by genre.
- [ ] Unknown-title grouping under "U".
- [ ] Folder/album art coverage when embedded art is missing.

### System integration (Milestone 7)
- [ ] Tray controls (`tray://control`) wired to the stores.
- [ ] Daemon events (`daemon://event`) wired to the stores.
- [ ] Updater: check / install update UI.
- [ ] Visual parity pass: Apple-dark theme overrides on the Bootstrap base.
- [ ] Mobile / small-window layout constraints.

## In-app games (roadmap)
- [x] Sound Runner — mp3-shaped platformer (see CHANGELOG).
- [ ] **Fishing game** ("Cast & Catch") — spec:
      `docs/superpowers/specs/2026-06-03-fishing-game-design.md` (approved,
      awaiting plan/build).
- [ ] **Beat hero** rhythm game — note bars from the music (onset/beat
      detection); notes map to the **home-row keys** (a s d f j k l ;) so it
      doubles as a typing/keyboard trainer.

## Audiophile / post-parity
- [ ] ReplayGain (track gain + album gain modes).
- [ ] True **gapless** playback — needs a backend `native_audio` gapless/preload
      command before a UI toggle is meaningful.
- [ ] Crossfade (after gapless is stable).
- [ ] Clipping / peak meter + better signal metering.
- [ ] Importable / savable DSP presets.
- [ ] Evaluate exclusive / hog mode where platform APIs allow it.

## Tooling / cutover
- [ ] Fix the `cargo tauri build` `beforeBuildCommand` path bug (it runs
      `npm --prefix frontend` from `frontend/`, yielding `frontend/frontend`;
      currently worked around by blanking it during bundling).
- [ ] Full smoke pass: play a `~/Music` track, exercise every tab.
- [ ] Confirm `dist` is pure build output; delete legacy `dist/index.html` note.
- [ ] Merge `epic/vibeui-migration` → release branch.

## Acceptance criteria (open)
- [ ] Installable via `cargo install` without extra proprietary runtime deps.
- [ ] Idle resource targets met (<100MB RAM, <1% CPU).
- [ ] Metadata auto-fill updates missing fields after background operation.


# Code Review — 2026-06-02

Scope: full Rust workspace (`coreamp-common`, `coreamp-daemon`, `coreamp-app`).
Reviewed: ~4,000 LOC across 10 files. Clippy clean; findings below are runtime / design issues
clippy does not catch. No behavioral change suggestions unless explicitly required for safety.

## Critical

### C1. `coreamp-common/src/db.rs:12-24` — Global `Mutex<Connection>` held during file I/O
`OnceLock<Mutex<Connection>>` serializes every DB op. `backfill_duration_for_missing`
(`db.rs:595-624`) opens, parses, and writes per file **while holding the lock** — a 50k-track
library freezes the entire app/daemon for the duration. `upsert_scanned_files`
(`db.rs:194-198`) does the same when called from `index_library_dirs` (the
`to_scanned_file` call at `library.rs:180` is outside the lock, but
`upsert_scanned_files` re-locks; in practice the long path is the per-file
`lofty::read_from_path` in `backfill`).
**Fix**: switch to a connection pool (e.g., `r2d2_sqlite`), or release the lock between
I/O, or run backfill on a worker thread that opens its own connection. Enable WAL
(`PRAGMA journal_mode=WAL`) so readers don't block writers.

### C2. `coreamp-common/src/db.rs:573-593` — `get_all_metadata_hashes` loads entire DB into memory
For every scan, the full `metadata_hash` column is pulled into a `HashMap<String, String>`
even though the upsert already uses `ON CONFLICT`. For a 100k-track library this is
~5–10 MB of duplicated strings per scan, allocated twice (path + hash).
**Fix**: query only the candidate paths for the current scan (intersect with
`scan_library_files` results), or fold the cache check into the `INSERT ... ON CONFLICT`
and compute hash only for unmatched rows.

### C3. `coreamp-common/src/musicbrainz.rs:79-109` — No rate limiting, no contact, stale UA
`enrich_missing_metadata` fires 25 sequential `reqwest` calls with no throttle.
MusicBrainz mandates 1 req/sec and a descriptive UA with contact info. Current UA
`"CoreAmp/0.2.0 (https://github.com/yourusername/coreamp)"` (L87) is **stale** (app is
0.4.0) and has no email; will trigger 503 / IP block. Failures are silently swallowed
(`library.rs:231` `Err(_) => continue`) so the operator never sees it.
**Fix**: enforce ≥1s between requests (token bucket or `thread::sleep`), update UA to
`CoreAmp/0.4.0 (https://github.com/velkymx/CoreAmp; contact@…)`, and surface persistent
failures to the daemon-event log.

### C4. `coreamp-app/src/main.rs:776-805` — `hydrate_track_from_file` re-parses every file on every list call
`list_library` invokes `library_track_from_row` for each row, which calls
`hydrate_track_from_file`, which calls `metadata::read_track_metadata` (opens the file,
runs `lofty::read_from_path`). For 300 rows that's 300 file opens + tag parses **per
UI render**. A 10k-track library is unusable.
**Fix**: do hydration at scan/upsert time and store the merged result in the DB, or add
an in-memory LRU keyed by path+mtime.

### C5. `coreamp-common/src/library.rs:109-134` — `collect_media_dir` follows symlink cycles
`path.is_dir()` follows symlinks and pushes them back onto the stack. A self-referencing
or mutually-referencing symlink will recurse until the OS limit (or OOM on some FS).
**Fix**: track visited canonical paths in a `HashSet<PathBuf>` (compare via
`std::fs::canonicalize`) and skip already-seen inodes.

### C6. `coreamp-app/tauri.conf.json:14-17` — Asset protocol scope is `["**"]`
The frontend can read any file on disk through the `asset:` protocol. With the existing
CSP allowing `unsafe-inline` scripts (`tauri.conf.json:13`), any XSS lets an attacker
exfiltrate `~/.ssh/id_rsa`, keychains, etc.
**Fix**: scope the asset protocol to user-configured roots only
(e.g., `~/Music`, `~/.config/CoreAmp/playlists`, `~/.config/CoreAmp/ipc`).

## High

### H1. `coreamp-common/src/ipc.rs:65-97` — `next_event_id` and `trim_events_file` are not atomic
`read → parse → write` for the sequence file (L65-75). Two concurrent writers collide
and produce duplicate `id`s. `trim_events_file` (L77-97) reads the whole file, slices,
re-joins, and re-writes — O(n) on **every** publish, with no locking against the
polling reader in `coreamp-app/src/main.rs:1710-1725`.
**Fix**: use an `AtomicU64` (mmap or in-process) for the sequence; for trimming, snapshot
file size on first write per minute and trim out-of-band.

### H2. `coreamp-app/src/main.rs:1710-1725` — IPC poll thread is a leak
Thread loops forever with no shutdown signal. After the Tauri app exits, the thread
keeps `fs::read_to_string`ing until process death. Also reads and JSON-parses the
**entire** events file every 2 s — O(n) per poll, scaled by 30/min.
**Fix**: keep a file offset; read incrementally with `seek`+`read`, or use `notify` to
wake on changes. Use a `CancellationToken` / `AtomicBool` to exit on app teardown.

### H3. `coreamp-common/src/db.rs:12-24` — Poisoned mutex is fatal
A panic in any DB call poisons the `Mutex<Connection>`; every subsequent op returns
the poison error. `map_err(|err| err.to_string())` propagates and the app is dead.
**Fix**: on `lock().unwrap_or_else(|p| p.into_inner())` to recover.

### H4. `coreamp-common/src/library.rs:201-221` — Inconsistent backfill
`index_library_dirs` (L187) calls `backfill_duration_for_missing`; `index_explicit_paths`
does not. Same scan, different behavior. A track added via the picker never gets a
duration.
**Fix**: extract a shared `index_inner` helper that always backfills.

### H5. `coreamp-app/src/main.rs:605-618, 1758-1776` — Tauri scan runs synchronously on the IPC thread
`scan_library` (a `#[tauri::command]`) blocks the IPC worker for the full duration of
the scan + backfill. The tray menu handler at L1759-1776 does the same on the tray
event thread, freezing the tray until the scan finishes.
**Fix**: spawn the scan on a worker (`tauri::async_runtime::spawn`), emit progress
events; have the tray handler trigger an `app.emit` and return immediately.

### H6. `coreamp-app/src/main.rs:1180-1203` — `read_track_signal_details` decodes the file just to get `total_duration`
`Decoder::new(BufReader::new(file))` may buffer the file (depending on format). For a
Vorbis/Opus file, `total_duration()` iterates the file. Blocks the IPC thread.
**Fix**: read duration via `lofty` (which already has it from headers) without a
full decoder.

### H7. `coreamp-app/src/main.rs:437-451` — DSP coefficient recompute on every sample
`NativeDspSource::next` calls `refresh_runtime` on every sample, which checks
`shared_settings.version()`. A user dragging an EQ slider bumps the version; every
sample for the next minute reallocates `channel_states` (Vec of BiquadStates ×
channels × bands) and re-runs `from_settings`.
**Fix**: snapshot once per `current_span_len` batch, or debounce version updates
(coalesce settings writes over 50ms).

### H8. `coreamp-app/src/main.rs:914` — `use std::io::Cursor;` mid-file
Convention violation; import sits between `#[tauri::command]`s. Clippy allows it;
lints like `clippy::items_after_statements` would catch it under the right group.
**Fix**: move to the top with the other imports.

### H9. `coreamp-common/src/library.rs:50-62` — `COREAMP_LIBRARY_DIRS` is colon-delimited
On Windows the path separator is `;`. This hard-coded `:` misparses Windows paths.
Also, on Linux it doesn't honor `XDG_MUSIC_DIR`.
**Fix**: use `std::env::split_paths` (platform-aware), and fall back to
`XDG_MUSIC_DIR` from `xdg-user-dirs`.

### H10. `coreamp-app/src/main.rs:60-67` — Daemon event poll `last_id` can permanently miss events
`read_daemon_events(None, Some(1))` returns the **last** event from the file. If the
app starts after the daemon has published events 1–500 (then trimmed to 1–500
already-trimmed), the new app reads 1 as the last event and starts from there. Fine.
But: if the seq file is reset / events file rotated / `last_id` loaded before the
daemon writes its first event, `unwrap_or(0)` silently starts at 0, and the app re-emits
all 500 historical events on first poll. UI floods.
**Fix**: persist `last_id` to disk; or only emit events with `id > persisted_floor` on
startup.

## Medium

### M1. `coreamp-common/src/db.rs:100-132` — Migrations on every `apply_schema`
Each `get_db` call re-runs `PRAGMA table_info` and the 5 `ALTER TABLE` checks. Cheap,
but still 5 round-trips per cold start. Acceptable; flag as future perf.

### M2. `coreamp-common/src/db.rs:81-83` — Dead column `cover_url`
Defined in schema, never read or written. Either wire it up (artwork cache) or drop it.

### M3. `coreamp-common/src/db.rs:360-425` — Repeated `query_map` boilerplate
`list_all_artists`, `list_all_albums`, `list_all_genres`, `list_all_genre_summaries`,
`list_top_artists` all hand-roll the `Vec::new` + `for row in rows` pattern. Extract
`fn collect<T>(stmt, ...) -> Result<Vec<T>, String>` helper.

### M4. `coreamp-common/src/library.rs:171-221` — `index_library_dirs` and `index_explicit_paths` are duplicates
~25 lines copy-pasted. Extract a shared helper.

### M5. `coreamp-common/src/metadata.rs:200-216` — `is_missing` and `normalize_owned` are duplicates
`is_missing(Option<Cow<str>>)` and `normalize_owned(Option<String>)` both trim+empty-check.
Reuse the existing `is_present` and `normalize` helpers.

### M6. `coreamp-common/src/db.rs:201-273` — `list_library_files` placeholder order is fragile
SQL references `?1`, `?2`, `?3`, `?4` but the `params!` order is `[limit, genre,
search, offset]`. Works, but indices are non-sequential in the SQL string. Comment the
binding map, or build the query with `push_bind`.

### M7. `coreamp-app/src/main.rs:1141-1165` — `parse_wav_bit_depth` reads only 512 bytes
Real-world WAV files with large `LIST`/`INFO` chunks before `fmt ` will return `None`
and `bit_depth` is reported as unknown. Read in a loop until the `fmt ` chunk is found,
or accept the loss and surface a clear "(unknown)" in the UI.

### M8. `coreamp-app/src/main.rs:171-194, 1266-1273` — `find_output_device_by_name` runs twice on `SetOutputDevice`
L1430 looks the device up for validation, then `ensure_output_stream` looks it up
again. Cheap but unnecessary; pass the `Device` through.

### M9. `coreamp-app/src/main.rs:1088-1097` — `update_track_metadata_for_path` silent no-op
If the path is not in the DB, `db::update_track_metadata` returns `Ok(false)` and the
UI gets a stale track from `track_from_path` (which hydrates from file). No signal that
nothing was persisted.
**Fix**: return an error if `changed == 0`, or `INSERT` when missing.

### M10. `coreamp-app/src/main.rs:222-229` — `with_runtime_status` silently drops poison
`native_audio_status` (L1608) handles poison explicitly; `with_runtime_status` does not.
Inconsistent. Unify on `unwrap_or_else(|p| p.into_inner())`.

### M11. `coreamp-app/src/main.rs:1088-1097` — Race: scan can clobber user edits
`to_scanned_file` re-reads tags from the file. After a user edits tags via
`write_tags` (which changes mtime), the next scan sees the user's new tags. So far
consistent. But: if `write_tags` fails mid-write (disk full, perms), the file is in an
intermediate state. The next scan reads partial data and overwrites the DB.
**Fix**: validate the post-write file by re-reading it, or use a write-then-fsync
guarded by lofty's atomicity guarantees.

### M12. `coreamp-common/src/library.rs:75-88` — Hash includes full path
Move the library, all hashes invalidate and every file is re-read and re-parsed on the
next scan. Hash relative to the scan root instead, or store only `mtime + size`.

### M13. `coreamp-app/src/main.rs:1727-1742` — Menu items rebuilt but never updated
The tray `previous`/`play`/`next` items have static labels. If the goal is dynamic
"Now Playing" display, this is a stub. Either drop the labels or wire to a state
event.

### M14. `coreamp-app/src/main.rs:1780-1791` — No way to reopen the window on Linux/Windows after close
Default Tauri behavior: closing the main window exits the app. The tray click handler
does call `window.show()` but only if a window exists. After the main window is
destroyed on Linux, the tray is dead-end.
**Fix**: on window `CloseRequested`, hide instead of close (or recreate the window
on tray click).

### M15. `coreamp-common/src/metadata.rs:218-226` — `parse_year_timestamp` accepts year 0
`u16::parse("0000")` succeeds and yields `Timestamp { year: 0 }`. Tag written with year 0.
**Fix**: `if year == 0 { return None }`.

## Low

### L1. `coreamp-app/src/main.rs:1141-1165` — `parse_wav_bit_depth` doesn't validate WAVE spec
Non-PCM (WAVE_FORMAT_IEEE_FLOAT, WAVE_FORMAT_EXTENSIBLE) reports raw `bits_per_sample`
which can be 32 (float) or 0 (extensible container). The UI displays 32 and the user
thinks it's 32-bit PCM. Cosmetic.

### L2. `coreamp-app/src/main.rs:460-505` — `clamp(-1.0, 1.0)` after limiter
The limiter already asymptotes to ±1.0; the final `clamp` is defensive but masks
any bug in `soft_limit` (e.g., NaN propagation). Use `clamp` only as a NaN guard:
`if !output.is_finite() { 0.0 } else { output.clamp(-1.0, 1.0) }`.

### L3. `coreamp-common/src/playlist.rs:56-60` — Temp-file collision risk
Temp suffix is `unix_millis`. Two `write_playlist` calls in the same millisecond to
different playlists share the same suffix and overwrite each other's temp file.
**Fix**: use `tempfile` crate or include a random component.

### L4. `coreamp-common/src/playlist.rs:8-22` — `sanitize_playlist_name` allows `..`
Trimmed, `..` becomes `..` (no separators to replace). `with_m3u_extension` adds
`.m3u` → `...m3u`. Not a traversal, but the resulting filename is surprising. Reject
or normalize `..` segments explicitly.

### L5. `coreamp-app/src/main.rs:7-9` — Inconsistent use of `Arc<SharedNativeDspSettings>` vs `Mutex<NativeDspSettings>`
The combo of `AtomicU64` version + `Mutex<NativeDspSettings>` is correct but heavy.
A `parking_lot::RwLock` (or just a `Mutex`) is simpler and the atomic is unused for
ordering — only equality. Either drop the version (always snapshot) or use the atomic
as the only source of truth with `unsafe` to publish a `NativeDspSettings` (no, that
needs an Arc). Simplest: keep the `Mutex`, drop the `AtomicU64`.

### L6. `coreamp-common/src/metadata.rs:144-156` — `artwork_from_tag` trusts the tag's MIME
A malicious tag can claim `image/jpeg` and embed arbitrary bytes. `image::load_from_memory`
is robust but historically has had decode panics on crafted inputs. Validate the
header (magic bytes) before passing to the decoder.

### L7. `coreamp-app/src/main.rs:1720` — `let _ = app_handle.emit(...)` discards error
If emit fails (channel closed during teardown), no signal. Acceptable here but
inconsistent with the rest of the file that does `if let Err(...) = ...`.

### L8. `coreamp-app/src/main.rs:1759-1776` — Tray scan emits `ScanResult` but no event name conflict check
Multiple scans triggered (tray click, IPC, GUI button) can race; each emits events
that the UI must deduplicate. Consider a single source of truth with a request-id.

### L9. `coreamp-common/src/db.rs:596-624` — `backfill_duration_for_missing` swallows per-row errors
`.ok()` on the UPDATE hides failures. For diagnostic purposes, increment a counter and
expose it via the scan summary.

### L10. `coreamp-common/src/musicbrainz.rs:6-13` — `extract_year` accepts `0000`
Same as M15.

### L11. `coreamp-app/src/main.rs:1727-1742` — Tray menu does not show playing state
The `toggle_playback` label is static "Play/Pause". UX: show "Pause" when playing,
"Play" when paused. Minor.

### L12. `coreamp-app/src/main.rs:1608-1631` — `native_audio_status` resets `finished` to `false` on every read
If a UI poll reads status between the audio thread setting `finished = true` and
the next Play, the event is lost. Either keep the latch until acknowledged by the
caller, or emit a dedicated `track-finished` event.

### L13. `coreamp-app/src/main.rs:1066-1086` — `normalize_metadata_input` closure captures nothing
Trivial, but using a free function `fn clean(value: Option<String>) -> Option<String>`
is more idiomatic than the `let clean = |...|` closure.

## Security

- **S1 (HIGH)** — Asset protocol `["**"]` scope. See C6.
- **S2 (MEDIUM)** — CSP allows `'unsafe-inline'` and `'unsafe-eval'` for scripts
  (`tauri.conf.json:13`). Combined with the asset scope, an XSS in the bundled JS
  (e.g., a vulnerable npm dep in `dist/`) becomes a local-file-read primitive. Remove
  `'unsafe-eval'` in release builds; keep `'unsafe-inline'` only if needed by the
  framework (audit).
- **S3 (LOW)** — `tauri-plugin-updater` `pubkey` is base64-decoded at runtime; verify the
  pinned key matches the `minisign` public key committed to the repo (the comment
  "minisign public key:" is present, which is good). Ensure the key is rotated out of
  band.
- **S4 (LOW)** — `pick_scan_paths` shells out to `osascript` with a hard-coded script
  (`coreamp-app/src/main.rs:875-890`). The script content is constant; no injection
  vector, but any future change to inject `kind` into the script must escape it.
- **S5 (LOW)** — `save_settings` accepts any `api_proxy` string and passes it to
  `reqwest::Proxy::all` (`coreamp-common/src/musicbrainz.rs:88-91`). A malicious string
  is rejected by `Proxy::all`, but the error message echoes the user input — log
  injection risk. Already handled by the `?` propagation; just be aware.

## Edge cases that will break this

1. **Empty `HOME` env var** → `config_dir` falls back to `.` (cwd). If launched from a
   directory the user can write to, IPC and DB land there. `library.rs:38-46` has the
   same fallback for library roots. Scoped writes only.
2. **`COREAMP_LIBRARY_DIRS` containing non-existent paths** → silently scanned as
   empty; no error reported. Daemon publishes `scan-started` with roots=0 and
   `scan-skipped`. UX bug.
3. **Two CoreAmp instances writing to the same DB** → SQLite locking; without WAL,
   `SQLITE_BUSY` errors. `Mutex<Connection>` masks this on the app side, but if
   the daemon is also running, the daemon's connection and the app's `Mutex<Connection>`
   are two separate processes and the file lock will stall one of them.
4. **Track file deleted between scan and playback** → `native_audio_play` opens,
   `Decoder::new` errors, returns `Err` to caller, sets `available = false`. OK, but
   `current_path` is also set to `Some(path)` so subsequent UI status reads the
   dead path. Cosmetic.
5. **Track file replaced (same path, different content) mid-playback** → the open
   `File` handle still points to the old inode on some OSes. `Decoder` continues
   reading the old content silently. No re-decode on play. Probably fine for music.
6. **Library on a network share (SMB/NFS) where mtime is rounded** → `metadata_hash`
   is stale on every scan, all files re-processed. Trivial for now but will dominate
   scan time on large libraries.
7. **Symlink cycle in library root** → see C5.
8. **APFS firmlinks / hardlinks** → `fs::metadata` follows them, file appears N times
   in scan, N rows in DB. Probably desired; flag for awareness.
9. **MusicBrainz rate-limit hit** → all 25 enrichments in a scan return 503, silently
   swallowed. Operator never knows. See C3.
10. **EQ band count changed from N to M at runtime** → `ChannelDspState::new` is
    called per channel (re-allocates Vec of BiquadStates). Audio glitches for one
    sample. Acceptable.
11. **Volume 0.0 set during Play** → no audio output, no event. Status reports
    `active = true`, `current_path = Some(...)`. UI must not assume "no audio = paused".
12. **Path with non-UTF8 bytes on Unix** → `to_string_lossy()` produces `OsStr`-lossy
    strings; comparisons against the DB (which stored the same lossy string) work,
    but display in the UI shows `?` characters. Cosmetic.
13. **Playlist file manually edited to contain a directory path** →
    `load_playlist` → `track_from_path` → `db::get_library_file` returns None →
    `read_track_metadata` is called on a directory. `lofty::read_from_path` fails
    silently and returns `TrackMetadata::default()`. Track shows as
    `title=None, artist=None, duration=None`. Should reject directories explicitly.

## Rust best-practice notes

- **Module organization**: `coreamp-common/src/lib.rs` is fine, but `metadata::read_track_metadata` returns
  by value with optionals that are then merged. A builder/accumulator is overkill; current shape is OK.
- **Error type**: every public function returns `Result<T, String>`. A `thiserror` enum
  (e.g., `CoreAmpError { Db, Io, Tag, Network, ... }`) would let the UI render
  appropriate messages and let the daemon log structured errors.
- **Panics**: no `unwrap()` in hot paths; the codebase is good here. `Mutex::lock().unwrap_or_default`
  in the audio thread would be a bug (silently dropping a state update on poison);
  it's `unwrap_or_default` for the *device name* (line 1311), which is fine because
  the device name is just a string.
- **Cloning**: `LibraryTrack` cloning in `list_library` is acceptable (300 rows).
- **Tests**: `db.rs` has good coverage. `library.rs` covers extensions + recursion.
  `metadata.rs`, `musicbrainz.rs` have a few. `ipc.rs`, `settings.rs`, `playlist.rs`
  are partially covered. `coreamp-app/src/main.rs` (1842 lines) has **zero tests**.
  The DSP code (`NativeDspSource`, biquad math) is the most important thing to test
  and is currently untested.
- **Concurrency**: `mpsc` for the audio thread is correct. `Mutex<NativeAudioRuntimeStatus>`
  is held briefly. `Arc<SharedNativeDspSettings>` for cross-thread DSP config is OK.
- **Edition 2024** with let-chains: `if let Some(x) = ... && condition` is used
  throughout (e.g., `ipc.rs:134-138`, `library.rs:178-184`, `coreamp-app/src/main.rs:922-936`).
  Consistent.

## Recommended fix priority

1. C1, C2, C3, C4 (performance + rate limit + re-parse storm) — single biggest user-facing
   impact.
2. C5, C6 (correctness + security) — silent data loss / file disclosure.
3. H1, H2, H3, H4, H5, H6 (concurrency + scan blocking) — UX and stability.
4. DSP test coverage (no test file for `coreamp-app/src/main.rs`).
5. M*, L*, S* as cleanup.
