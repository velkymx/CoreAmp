# Changelog

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
