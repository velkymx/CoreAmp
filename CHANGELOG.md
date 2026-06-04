# Changelog

## [Unreleased] - Backend hardening & P1 parity

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
