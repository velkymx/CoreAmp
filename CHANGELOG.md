# Changelog

## [Unreleased]

## [0.6.0] - 2026-08-10 - Backend hardening & P1 parity

- 2026-08-05 Toast doesn't dedupe identical messages - `coreamp-app/frontend/src/stores/notify.ts::push` now drops an identical (kind+text) note fired within a 2s window. A tight loop of identical errors (failing background scan, repeated media-key handler) used to stack identical toasts. `Note.createdAt` added; 4 new tests cover same-window dedupe, after-window, cross-kind, cross-text.
- 2026-08-05 No global Vue error handler / unhandled rejection listener - added `app.config.errorHandler`, `window 'unhandledrejection'`, and `window 'error'` handlers in `coreamp-app/frontend/src/main.ts`. All three route through `useNotifyStore().error(...)` so component throws + async rejections + uncaught sync errors surface as a toast instead of silently dying in the browser console. Each handler falls back to `console.error` if the notify store itself throws to prevent an infinite loop.
- 2026-08-05 OnceLock caches DB init failure forever - documented the trade-off in `get_db()`. The `OnceLock<Result<...>>` cache means a failed first open poisons the result for the rest of the process; the user must restart the app to retry. The fix would require `OnceLock<Mutex<Option<...>>>` with `unsafe` to satisfy the borrow checker (returning `&'static Mutex<Connection>` from inside an `Option`). Mitigation already in place: `open_and_init()` runs a one-shot quarantine + reopen on the first failure, so the only cache-poisoning errors are persistent (disk, permissions). The comment in `get_db()` records the decision.
- 2026-08-05 No PRAGMA integrity_check / quick_check on DB open - `coreamp-common/src/db.rs::open_and_init` now runs `PRAGMA quick_check` after the schema is applied. On failure the DB file is moved to `local.db.corrupt-<unix-ts>` and the open is retried once; `apply_schema` then rebuilds from `MIGRATIONS`. The second failure surfaces both errors so the user has something to file a bug against. New test verifies the quarantine rename.
- 2026-08-05 save_settings non-atomic + no backup of corrupt settings.json - `coreamp-common/src/settings.rs` now writes to `settings.json.tmp` then `fs::rename` (atomic on the same filesystem). `load_settings` on parse error renames the bad file to `settings.json.corrupt-<unix-ts>` and returns `Ok(default())` so the app boots with defaults instead of breaking on every launch. 3 new tests cover missing-file default, save/load round-trip, and corrupt-file recovery. All env-mutating tests now share a process-wide mutex (`crate::test_lock::ENV_MUTEX`).
- 2026-08-05 apply_schema has no PRAGMA user_version - replaced the ad-hoc column-check-then-ALTER loop in `coreamp-common/src/db.rs` with an ordered `MIGRATIONS: &[(u32, &str)]` table. Each entry runs in an `unchecked_transaction` so a partial apply leaves `user_version` unchanged and retries on next open. Refuses to silently downgrade a DB written by a future build. 3 new tests cover version recording, idempotent re-apply, and downgrade refusal.
- 2026-08-05 list_library_files SQL built by String concat - refactored to a single static SQL with conditional `WHERE (?2 IS NULL OR genre = ?2)` / `(?3 = '' OR LIKE ?3)` / `(?5 = 0 OR liked = 1)` predicates. No splicing of user values, no `?N` index juggling. Extracted `list_library_files_with_connection` for testability; new test exercises every filter combination and pins the parameter order.
- 2026-08-05 set_tray_now_playing no length cap - added a 256-byte cap on the label argument in `coreamp-app/src/main.rs`. A malicious frontend (or runaway notification) can no longer push a multi-MB string into the tray update thread.
- 2026-08-05 ReplayGain tag unbounded → audio clip / hearing damage - clamped `parse_replay_gain_db` output in `coreamp-common/src/metadata.rs` to +/-24 dB and rejected non-finite values (inf, nan). A malicious or corrupted "+999 dB" tag no longer translates to a 10^50 linear gain. 3 unit tests cover clamping + boundary + inf/nan rejection.
- 2026-08-05 PII: full home dir in daemon stdout - replaced full-path prints in `coreamp-daemon/src/main.rs` (config dir, db path, scan roots) with basenames. The daemon runs as a launchd service with stderr at `/tmp/coreamp-daemon.err.log` (world-readable on most macOS systems). GUI still receives the full paths via the IPC event payload.
- 2026-08-05 connect-src whitelists github.com but no code uses it - removed `api.github.com`, `github.com`, and `objects.githubusercontent.com` from `coreamp-app/tauri.conf.json` CSP `connect-src`. The Tauri updater uses its own IPC for signature download, not the webview fetch. Only `self`, `ipc`, `asset` remain.
- 2026-08-05 Asset protocol scope loaded non-atomically - replaced `let _ = asset_scope.allow_directory(...)` with explicit error logging and a non-empty-scope check in `coreamp-app/src/main.rs`. An empty scope used to silently 404 every `convertFileSrc` request; now the operator gets a stderr line.
- 2026-08-05 core:default grants every core command - dropped `core:default` from `coreamp-app/capabilities/default.json`. The frontend uses only `invoke` for user-defined Rust commands; the permission system only gates built-in core commands, all of which the app does not call from src/. Only `updater:default` remains. Webview loses access to core:app:*, core:window:*, core:event:*, core:webview:*, etc.
- 2026-08-05 Path traversal: arbitrary file read/write across 8+ IPC commands - added `coreamp-common/src/path.rs::validate_library_path` (canonicalizes, rejects symlink escapes, refuses `..` segments, requires the path be under an `asset_scope_roots()` entry). Wired into 9 IPC commands in `coreamp-app/src/main.rs`: `set_track_artwork`, `read_track_artwork`, `append_to_playlist`, `load_playlist`, `import_playlist_file`, `write_missing_tags_for_path`, `update_track_metadata_for_path`, `read_track_signal_details`, `native_audio_play`. Without this gate the webview could pass arbitrary absolute paths (e.g. `/etc/passwd`) and have the backend read or write them. 5 unit tests cover happy path, rejection, and symlink escape.
- 2026-08-05 Remove unused objc2 / image (in coreamp-common) / dompurify - dropped `objc2` from `[workspace.dependencies]` and the `cfg(target_vendor = "apple")` block in `coreamp-app/Cargo.toml` (never `use`d). Dropped `image` from `coreamp-common/Cargo.toml` (only used in `coreamp-app`). Dropped `dompurify` from `package.json` (never imported in app code or tests; only transitive via VibeUI). Kept `thiserror` (used in `error.rs`), `urlencoding` (used in `musicbrainz.rs`), and `image` in `coreamp-app` (used in `read_track_artwork`). Verified: release build produces 16MB stripped binary + 10MB DMG.
- 2026-08-05 Tauri 2 updater allow-download-and-install always on - dropped redundant `updater:allow-check` and `updater:allow-download-and-install` from `coreamp-app/capabilities/default.json` (already included by `updater:default`); added `coreamp-app/capabilities/README.md` documenting that Tauri 2 capabilities are static and the actual runtime gate is the explicit "Download & install" button in `SettingsView.vue`.
- 2026-08-05 Tauri window missing minWidth/minHeight - added `minWidth: 800, minHeight: 700` to `coreamp-app/tauri.conf.json` app.windows[0]. Prevents resizing below the minimum that keeps the library + queue panes usable.
- 2026-08-05 Tauri bundle.icon missing 256x256 PNG + master icon.png - added `icons/icon.png` (512x512 master, already on disk) to `coreamp-app/tauri.conf.json` `bundle.icon`. The 256x256 requirement is already covered by the existing `128x128@2x.png`.
- 2026-08-05 No SemVer automation, no CODEOWNERS - added `.github/CODEOWNERS` with `* @velkymx` default. SemVer automation (tagpr/release-please) deferred.
- 2026-08-05 No engines / packageManager in package.json - added `engines.node: ">=20.18"` (minimum for vitest 4 + vue-tsc 3) and `packageManager: "npm@10"` (matches `.nvmrc` 24 + CI).
- 2026-08-05 Bump @velkymx/vibeui 1.1.1 -> 1.1.2 - bundle size dropped 201KB -> 171KB raw (54KB -> 44KB gzip). No source changes.
- 2026-08-05 Tauri updater endpoint + draft release is race-y - replaced 3 `softprops/action-gh-release@v2` calls with a single `release` job in `.github/workflows/package.yml` that downloads both platform artifacts, builds `latest.json`, and publishes everything in one go. Dropped the bogus `darwin-x86_64` entry (no x86_64 build produced). Bumped `MACOSX_DEPLOYMENT_TARGET` to 26.0. SHA-pinned all Actions in `package.yml`.
- 2026-08-05 CI doesn't chmod +x packaging scripts - added a `chmod +x packaging/linux/*.sh packaging/macos/*.sh` step to the `rust` job so Windows checkouts don't break release builds.
- 2026-08-05 butterchurn*.min.js is dead weight (384KB shipped, 0 imports) - deleted `butterchurn.min.js` and `butterchurnPresetsMinimal.min.js` from `coreamp-app/frontend/public/vendor/`. Vendor folder now contains only `audiomotion-analyzer.min.js` and `three.min.js`.
- 2026-08-05 Vite sourcemap not configured, no manualChunks, no cssCodeSplit - set `build.sourcemap = "hidden"`, `build.target = "es2022"`, `build.cssCodeSplit = true`, and `build.rollupOptions.output.manualChunks` as a function (rolldown requires it) splitting `vue` / `@vue` -> `vue`, `pinia` -> `pinia`, `@velkymx/vibeui` -> `vibeui`. Bundle: index 43KB + pinia 27KB + vibeui 55KB + quill 59KB (gzip).
- 2026-08-05 .gitignore missing *.min.js.map, .vite/ - expanded root .gitignore to cover Vite cache, vitest coverage output, npm cache, vendor source maps, IDE folders, vim swap.
- 2026-08-05 No .editorconfig, .gitattributes, pre-commit hooks - added `.editorconfig` (UTF-8, LF, 2-space, 4-space for Rust/TOML, trim trailing WS, final newline) and `.gitattributes` (LF normalization for source + shell, binary marks for common types). Pre-commit hooks deferred to a follow-up (no new dep in this change).
- 2026-08-05 No rust-toolchain.toml / .nvmrc / pinned tauri-cli - added `rust-toolchain.toml` (`channel = "stable"`, `components = ["rustfmt", "clippy"]`), `.nvmrc` (`24`), and pinned `tauri-cli = "=2.11.5"` in workspace `[workspace.dependencies]`.
- 2026-08-05 No [profile.release] in workspace Cargo.toml - added `lto = "thin"`, `codegen-units = 1`, `strip = "debuginfo"`, `panic = "abort"` to root `Cargo.toml`. Aligned Rust tauri 2.11.5 + tauri-build 2.6.3 + tauri-plugin-updater 2.10.1 with npm @tauri-apps/api 2.11.x (plugin-updater stays at 2.10). Restricted bundle targets to `["app", "dmg"]` and bumped `minimumSystemVersion` to 26.0 (host macOS 26.6 SDK). macOS arm64 release artifacts: 16MB stripped binary, 10MB DMG.
- 2026-08-05 GitHub Actions pinned by tag, not SHA - replaced all `uses: ...@vN` references in `.github/workflows/ci.yml` with full commit SHAs and version comments; Dependabot (ecosystem `github-actions`) will keep them current.
- 2026-08-05 No cargo audit / npm audit / Dependabot - added `.github/dependabot.yml` for cargo + npm + github-actions (weekly, grouped minor/patch) and a new `security-audit` job in `.github/workflows/ci.yml` running `cargo audit` and `npm audit --audit-level=high`.
- 2026-08-05 CI runs frontend test/lint/typecheck - new `frontend` job in `.github/workflows/ci.yml` runs `npm ci` + `npm run typecheck` + `npm test` on Node 24 with cached `~/.npm`; adds `permissions: contents: read` at workflow scope.
- 2026-06-03 Volume slider does not work - master GainNode added (element.volume is bypassed once routed through Web Audio).

- 2026-06-03 Remove database lock bottlenecks during scanning/metadata - WAL + busy_timeout; duration backfill parses files off-lock.
- 2026-06-03 Eliminate full-library metadata hash loading during scans - chunked IN query for the scanned paths only.
- 2026-06-03 Stop re-reading audio files during library browsing - serve scan-time DB values (no per-row file open).
- 2026-06-03 Move library scanning off UI and IPC threads - async commands via spawn_blocking; tray scan on its own thread.
- 2026-06-03 Prevent symlink recursion during scans - canonicalized visited-dir set.
- 2026-06-03 Improve large-library responsiveness - covered by the scan/browse perf fixes above.
- 2026-06-03 DSP coefficient recompute / EQ debounce / DSP realloc - N/A under web-only output (native DSP path bypassed).
- 2026-06-03 Restrict asset protocol access to approved locations - scoped to the music library + runtime allow_directory.
- 2026-06-03 Harden production CSP - add object-src 'none', base-uri 'self', frame-ancestors 'none', form-action 'self'.
- 2026-06-03 Add MusicBrainz request rate limiting - process-global gate, <=1 request / 1.1s.
- 2026-06-03 Update MusicBrainz user-agent string - version + project URL.
- 2026-06-03 Add contact information to MusicBrainz requests - project URL as contact per MB guidelines.
- 2026-06-03 Log persistent metadata-enrichment failures - per-failure log + per-pass count (no longer swallowed).
- 2026-06-03 Verify multi-process database access behavior - concurrent-writer test under WAL (no SQLITE_BUSY).
- 2026-06-03 Fix cargo tauri build path issue - before-commands run `npm run build`/`dev` (no doubled prefix).
- 2026-06-03 Add Light/Dark theme + in-app theme toggle - VibeUI useColorMode (System/Light/Dark), persisted.
- 2026-06-03 Play From Here - row context-menu action queues the list from the clicked track.
- 2026-06-03 Play Track Next - row context-menu inserts the track after the current one.
- 2026-06-03 Sort by Title/Artist/Album + A-Z toggle - VibeDataTable column sort (asc/desc).
- 2026-06-03 Search sort by genre - sortable/searchable Genre column.
- 2026-06-03 Unknown-title grouping under U - N/A (flat datatable has no alpha sections).
- 2026-06-03 Recently Added view - Home dashboard list ordered by updated_at DESC.
- 2026-06-03 Fix duration backfill for explicit path import - shared index core now backfills both scan paths.
- 2026-06-03 Genre editing / Year editing - Edit metadata modal fields.
- 2026-06-03 Dedup Playlist - Playlists tab funnel button (dedup_playlist).
- 2026-06-03 Save/Delete user EQ presets - named presets persisted to localStorage.
- 2026-06-03 Add Hip-Hop and Dance EQ presets - new built-in preset curves.

## [Unreleased] - Vue/VibeUI frontend migration

Replaced the legacy monolithic `dist/index.html` UI with a Vue 3 + Pinia +
VibeUI frontend (`coreamp-app/frontend`), reaching feature parity with the old
UI and beyond. Backend (Rust/Tauri commands) unchanged.

### Player
- Now-playing panel: embedded album art, title/artist, signal line
  (format / sample rate / bit depth / channels / bitrate).
- Transport: play/pause, prev/next, shuffle (current-first), repeat
  (off/queue/track), like, volume + mute.
- Progress bar with working scrubbing/seek driven by the audio element.
- Player-first layout: player card + queue panel on top, tabs below.

### Library & Liked
- `VibeDataTable` track list with column sort, search, and pagination.
- Segmented Tracks / Artists / Albums / Genres; artwork card grids for
  summaries; search box + genre filter; album-art row thumbnails.
- Inline like; row context menu (Play next / Add to queue / Add to playlist /
  Edit metadata); clickable artist/album metadata → filtered view.
- Liked view; play recording (`record_play`).

### Playlists & Queue
- Browse / open-into-queue / save-from-queue / de-dup / delete.
- Queue panel: reorder (move up/down), remove, Clear played, Stop after current.
- Add-to-playlist modal (append or create); `.m3u` drag-and-drop import.

### Home & Settings
- Dashboard: Top Artists + Recently Played artwork cards.
- Settings: scan interval, API proxy, scan library / add folders, clear history,
  app version.
- Edit-metadata modal (`update_track_metadata_for_path`).

### Audio / EQ
- Real Web Audio EQ: source → preamp → 5 peaking biquads → analyser → output;
  moving a slider or picking a preset (Flat/Warm/Presence/V Curve/Bass Cut)
  changes the sound. EQ bypass; boost cycle (Off/Boost+/Boost++); preamp.
- Live EQ response curve over a music-reactive spectrum.
- Single Web Audio output path (mp3-focused).

### Visualizer & games
- Visualizer modes: Bars, Spectrum, Oscilloscope, Orb (3D, ported three.js
  reactive scene); hover-reveal controls, pseudo-fullscreen, locked 16:9.
- Shared single-RAF frequency composable feeding all visuals.
- "Sound Runner" game: a Mario-style platformer whose terrain is generated from
  the playing mp3's loudness/bass envelope, Space-Invader enemies,
  music-reactive sky/clouds, global top-5 high scores (replaces Astro Chicken).

### Infrastructure
- Global notification/toast system surfacing all async failures (playback, DSP,
  library, playlists, settings, output).
- Typed Tauri API boundary; ~200 frontend unit/component tests (vitest).

## [0.3.2] - 2026-03-16

### Bug Fixes
- **Fixed macOS 26 (Tahoe) crash on startup** — App would bounce once and crash due to `objc2` strict encoding checks panicking on changed ObjC method signatures. Enabled `relax-sign-encoding` feature to handle Apple's signed→unsigned type changes. (See: [tao#1171](https://github.com/tauri-apps/tao/issues/1171))

### Dependencies
- Added `objc2` with `relax-sign-encoding` feature for macOS 26 compatibility.

## [0.3.1] - 2026-03-16

### Bug Fixes
- Fixed updater not producing signed bundles (added `createUpdaterArtifacts` to config).
- Fixed updater plugin registration to follow Tauri v2 pattern.
- Fixed GitHub Actions Node.js 20 deprecation warnings (upgraded to v5).

### Dependencies
- Updated `rusqlite` 0.38 → 0.39.
- Updated `wry` 0.54.2 → 0.54.3 (WebView engine — macOS compatibility).
- Updated all transitive dependencies to latest versions.

## [0.3.0] - 2026-03-16

### Auto-Updater
- **Built-in auto-updater** — App checks for updates on launch and from Settings panel.
- Download and install updates with one click; app restarts automatically.
- Signed update bundles verified with public key for security.
- "Updates" card in Settings shows current version and update status.

### Games
- **Arcade high scores** — Top 5 leaderboard per game, stored in localStorage.
- High score list shown on game over (Astro Alien, Shapes) and song complete (Keys, Fishing).
- New high scores highlighted with "NEW!" marker.
- **Astro Alien** (renamed from Astro Chicken) — Space Invaders-style enemies, coins bounce and dance to bass, background pulses from black to neon on every beat.
- **Guitar Hero Keys** — Song complete screen with score, accuracy, and leaderboard.
- **Neon Fishing** — Song complete screen with score, fish caught, and leaderboard.

### Packaging
- **Universal macOS binary** — Single app bundle runs on both Apple Silicon and Intel Macs.
- macOS compatibility extended to 10.13 (High Sierra) and up, including macOS 26 (Tahoe).
- `MACOSX_DEPLOYMENT_TARGET=10.13` set in build scripts and CI.
- CI workflow generates signed updater bundles and `latest.json` for auto-updates.

### Technical
- `tauri-plugin-updater` added for OTA updates via GitHub Releases.
- `serde_json` dependency added.
- Updater permissions added to app capabilities.
- CSP updated to allow GitHub API and download connections.

## [0.2.0] - 2026-03-15

### Games
- **Astro Chicken** (mode 4) — Free-roaming platformer with a flying saucer character, flap mechanic, pits, platforms, coins, and full rave effects. Music drives scroll speed, enemy spawns, and visual intensity.
- **Neon Fishing** (mode 5) — Black Bass/Pokemon-inspired fishing with Wii-style on-screen instructions, 5 fish types, stamina/run mechanics, combo multiplier, and Tron-style perspective water grid.
- **Guitar Hero Keys** (mode 6) — 4-lane keyboard rhythm game (D/F/J/K). Notes follow chord progressions driven by bass hits, pulse and scale with audio energy. Perfect/Great/OK accuracy with combo multiplier.
- **Shapes** (mode 7) — Just Shapes & Beats-style dodge game. Survive music-driven expanding rings, laser beams with safe gaps, bullet rain, and screen-wide waves. WASD to move, Space to dash. Difficulty ramps with survival time.

### Visualizers
- **Storm** (mode 3) — Thundercloud reactive mode with procedural canvas textures, 55 clouds, 14 lightning bolts, constant ambient lightning, and bass-driven screen shake.
- **Vortex** (mode 1) and **Nebula** (mode 2) — Three.js reactive modes with music-driven particle systems and color cycling. Nebula animation speed increased 2.5x.
- Spectrum sub-modes powered by audioMotion-analyzer.
- 8 reactive modes total: Orb, Vortex, Nebula, Storm, Game, Fishing, Keys, Shapes.
- Visualizer mode and sub-mode selections persist in localStorage.

### Library and Playlists
- **Paginated loading** — Tracks load in pages of 200 with "Load More" button.
- **Queue persistence** — Queue and current position saved to localStorage, restored on reload.
- **Playlist deduplication** — De-dup button per playlist. Tracks already present cannot be re-added.
- Search and filter by genre, artist/album/title, liked-only.
- Dashboard Home tab with artwork grid cards for top artists and recently played.
- Album art thumbnails in track rows with context menu.
- Save search results as playlist.
- Human-friendly import feedback messages.

### UI/UX
- Consolidated library tabs from 10 to 6 (Home, Library, Liked, Playlists, Audio, Settings).
- Segmented control for Tracks/Artists/Albums/Genres within Library tab.
- Artwork grid cards for Artists, Albums, and Genres browsing.
- Settings panel redesigned with card-based grid layout (Import, Appearance, Library, Data).
- Theme toggle moved to Settings panel.
- Tab buttons inline with Library heading.
- Signal details (format, bitrate) inline with track title.
- Like button is now just the heart icon (28px, no wrapper).
- Player height reduced by 90px.
- Library panel min-height doubled to 960px.
- Page scrolls naturally so library is fully accessible below the player.

### Technical
- audioMotion-analyzer replaces old EQ visualizer.
- Three.js r169 for 3D reactive modes.
- `image` crate added for embedded album art extraction.
- Devtools removed from default build (`--features devtools` for development).
- Snap packaging removed.

### Bug Fixes
- Fixed `bassVelocity` undefined in Storm visualizer causing no lightning.
- Fixed spectrum not reinitializing after audio graph setup.
- Fixed library not filling viewport height.
- Fixed CSP blocking tracks and IPC.
- Unknown titles now sort under "U" section.
