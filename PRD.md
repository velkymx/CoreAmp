# Technical Product Requirements Document (PRD)
**Project Name:** CoreAmp
**Version:** 1.0
**Status:** Draft
**Target Platforms:** Linux & macOS (No Windows)

---

## 1. Executive Summary
**CoreAmp** is a lightweight, privacy-first media player built for modern Linux and macOS desktops. It focuses on "Zero-Config Usability" while utilizing a background metadata daemon to automatically enrich user libraries. The project adheres to the **KISS (Keep It Simple, Stupid)** philosophy: minimal UI, robust performance, and local ownership of data.

## 2. Core Principles
1.  **KISS:** Minimalist interface. System tray by default. No bloat.
2.  **Open Source:** All code under MIT/Apache License. No proprietary SDKs.
3.  **Privacy First:** Zero telemetry. No cloud accounts. All data stored locally.
4.  **Unix Way:** Do one thing well. Use background daemons for heavy lifting (metadata enrichment).
5.  **Platform Native:** Optimized for Linux (Wayland/X11) and macOS (Metal/CoreAudio) APIs.

## 3. Technical Architecture

### 3.1 Technology Stack
| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Core Language** | **Rust** | Memory safety, zero-cost abstractions, single binary compilation. |
| **UI Framework** | **Tauri v2** | Web-based UI (HTML/CSS/JS) + Rust Backend. Lightweight footprint compared to Electron. |
| **Audio Output** | **CPAL** | Pure Rust abstraction. No heavy C dependencies. Cross-platform (CoreAudio/ALSA/PipeWire). |
| **Decoding** | **FFmpeg (via Rust Bindings)** | Industry standard for container/stream support. |
| **Rendering** | **Libplacebo (Optional)** | High-performance video rendering if video playback is required (via mpv bindings). |
| **Metadata** | **SQLite** | Local database for library caching and metadata enrichment. |
| **Tag Library** | **ID3v2-rs** | Writing/reading ID3 tags (MP3/AAC). |
| **Network Client** | **Reqwest** | Async HTTP for MusicBrainz/AcoustID API lookups. |
| **Async Runtime** | **Tokio** | High-performance asynchronous I/O. |
| **Build System** | **Cargo** | Standard Rust package manager. |

### 3.2 Component Architecture
The application is divided into two distinct processes:

#### A. CoreAmp (The UI App)
*   **Responsibility:** Playback control, UI rendering, drag-and-drop, playlist management.
*   **State:** Maintains current playback position and active playlist.
*   **Communication:** Listens for events from the Daemon via local IPC (Unix Sockets/IPC).
*   **Output:** Single compiled binary + HTML/CSS assets.

#### B. CoreAmp-Daemon (The Metadata Worker)
*   **Responsibility:** Scans file system, queries APIs, enriches metadata, writes tags.
*   **Startup:** System service (systemd on Linux, launchd on macOS).
*   **Logic:** Runs periodically or on file-event triggers.
*   **Storage:** Writes to local SQLite database (`~/.config/CoreAmp/metadata.db`).

### 3.3 Data Model
*   **Library:** Indexed as a flat list of file paths + metadata hash.
*   **Playlists:** Stored as **M3U** (`.m3u`) text files in `~/.config/CoreAmp/playlists/`.
*   **Metadata Cache:** Stored in SQLite (`local.db`).
    *   *Table `files`:* `id`, `path`, `filename`, `artist`, `album`, `title`, `year`, `cover_url`.
    *   *Logic:* Never overwrite existing tags unless `artist` or `title` is empty.

---

## 4. Feature Specifications

### 4.1 Playback Engine
*   **Format Support:** MP3, FLAC, OGG
*   **Video:** Hardware acceleration (VAAPI/NVDEC/Metal) enabled by default.
*   **Gapless Playback:** Configurable per playlist.
*   **Visualizer:** Simple waveform (WebGL/Skia integration).

### 4.2 Playlist System
*   **Creation:**
    *   **File:** Create from Library selection.
    *   **Import:** Drag-and-drop `.m3u` files.
*   **Persistence:**
    *   Playlists are files, not database rows.
    *   `File > Save Playlist` writes to `.m3u` or JSON.
*   **Queue:** Drag files directly from Library into the Playlist panel.

### 4.3 Metadata Enrichment (The "Auto-Fill" Feature)
*   **Behavior:** Runs silently in the background.
*   **Logic:**
    1.  Scan music folder.
    2.  Read current ID3 tags.
    3.  Query `local.db` for cached data.
    4.  If missing, query **MusicBrainz** (using filename or acoustic fingerprint).
    5.  Write updated tags to MP3 file (if empty fields).
*   **Privacy:** No cloud upload. All lookups local.

### 4.4 System Integration
*   **Startup:** Auto-launch on system boot.
*   **Tray Icon:** Always present. Minimized to tray by default.
*   **Notification Area:** Shows volume, shuffle, repeat icons.
*   **System Menu:** Provides "Quit" and "Scan Library" actions.

---

## 5. Non-Functional Requirements

### 5.1 Performance
*   **Launch Time:** < 2 seconds (Cold start).
*   **Memory Usage:** < 100MB RAM at idle.
*   **CPU Usage:** Idle CPU < 1% (when daemon not actively scanning).

### 5.2 Security & Privacy
*   **Telemetry:** None. No analytics tracking.
*   **Data Location:** No data sent to remote servers (except API lookups).
*   **Dependencies:** No proprietary licenses (LGPL/GPL/MIT only).
*   **Build Artifacts:** No bundled proprietary libraries (FFmpeg/MPV headers must be statically linked or LGPL-licensed).

### 5.3 User Experience
*   **Drag & Drop:** Supports `.mp3`, `.flac`, folders, and `.m3u` files.
*   **No Account:** No login screen.
*   **Settings:** Minimalist "Settings" page (only for Daemon scan interval and API proxy).

---

## 6. Development Roadmap

### Phase 1: Core Playback (MVP)
*   Implement Tauri UI + Rust Backend.
*   Integrate CPAL for audio output.
*   Implement Drag & Drop to play.
*   System Tray support.
*   **Deliverable:** `coreamp-app` binary.

### Phase 2: Library & Playlists
*   Implement `local.db` SQLite.
*   Implement playlist M3U parsing.
*   Implement basic metadata read/write.
*   **Deliverable:** Stable `v0.1.0` release.

### Phase 3: The Daemon (Auto-Fill)
*   Build `coreamp-daemon` service.
*   Implement MusicBrainz API integration.
*   Implement tag-waiting logic.
*   **Deliverable:** `v1.0.0` release with metadata enrichment.

### Phase 4: Polish
*   Custom theming (Dark/Light).
*   Video output integration (Libplacebo).
*   Installer generation (`.deb`, `.pkg`, `.AppImage`).

---

## 7. Build & Deployment Strategy

### 7.1 Linux (`.deb`/`.rpm`/`.AppImage`)
*   **Build Command:** `cargo install coreamp --locked`
*   **Systemd Service:** `/etc/systemd/system/coreamp-daemon.service`
    ```ini
    [Unit]
    Description=CoreAmp Metadata Service
    After=network-online.target
    [Service]
    Type=simple
    ExecStart=/usr/local/bin/coreamp-daemon --scan --interval=5m
    [Install]
    WantedBy=multi-user.target
    ```

### 7.2 macOS (`.pkg`/`.zip`)
*   **Bundle:** Bundle into a directory, then use `pkgbuild`.
*   **Launchd:** `/Library/LaunchAgents/com.coreamp.daemon.plist`

---

## 8. Acceptance Criteria (Definition of Done)
1.  **Single Binary:** Can be installed with `cargo install` without external dependencies (minus system libs like ALSA/Qt).
2.  **Zero Bloat:** Does not start up unnecessary processes.
3.  **Smart:** After 1 hour of playback, MP3 tags are updated automatically for missing data.
4.  **Clean:** No clutter in the UI.

---

## 9. Sign-off
*   **Lead Architect:** [Your Name/Role]
*   **Platform Focus:** Linux/macOS only.
*   **License:** MIT/Apache-2.0.

**Approved:**  _[Date]_