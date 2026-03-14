# CoreAmp TODO

## Phase 0 - Project Setup
- [x] Review `PRD.md` and translate requirements into an implementation checklist.
- [x] Initialize Rust workspace with `coreamp-app`, `coreamp-daemon`, and shared `coreamp-common`.
- [x] Add starter app/daemon binaries with Linux/macOS config path conventions.
- [x] Add CI checks (`cargo fmt`, `cargo clippy`, `cargo test`, `cargo check`).

## Phase 1 - Core Playback (MVP)
- [x] Scaffold Tauri v2 desktop shell for `coreamp-app`.
- [x] Implement basic transport controls (play/pause/seek/volume).
- [x] Integrate CPAL output path for audio playback.
- [x] Support drag-and-drop for `.mp3`, `.flac`, `.ogg`.
- [x] Add system tray integration with `Quit` and `Scan Library`.

## Phase 2 - Library & Playlists
- [x] Add SQLite `local.db` schema bootstrap (`files` table).
- [x] Implement library file indexing for configured folders.
- [x] Implement M3U read/write in `~/.config/CoreAmp/playlists/`.
- [x] Add metadata read/write for common tags (artist/album/title/year).
- [x] Wire UI playlist panel and queue interactions.

## Phase 3 - Daemon Auto-Fill
- [x] Add background scanner loop with configurable interval.
- [x] Implement cache lookup against `local.db`.
- [x] Parse MP3/file data into db
- [x] Display MP3 meta data (if available) in the UI
- [x] Integrate MusicBrainz lookup for missing metadata.
- [x] Update tags only when fields are empty.
- [x] Add IPC events between daemon and app (scan status + update notifications).

## Phase 4 - Polish and Packaging
- [x] Follow Apple Design Guidelines https://help.apple.com/pdf/applestyleguide/en_US/apple-style-guide.pdf
- [x] Add minimal settings screen (scan interval, API proxy).
- [x] Add performance profiling and startup optimization pass.
- [x] Add optional video path scaffolding (feature-flagged).
- [x] Add Linux service templates (`systemd`) and macOS launch agent template (`launchd`).
- [x] Prepare packaging workflow for Linux (`.deb`, `.AppImage`) and macOS (`.pkg`/`.zip`).

## Prioritized Audiophile Roadmap

### P0 - Sound Quality and Playback Credibility
- [x] Add parametric EQ with multiple bands, gain, frequency, Q, presets, and bypass.
- [x] Add first-pass `Audio` tab to the right of `Playlists`.
- [x] Add first-pass web-output parametric EQ with 5 bands, `Frequency`, `Gain`, and `Q`.
- [x] Add EQ presets (`Flat`, `Warm`, `Presence`, `V Curve`, `Bass Cut`) and reset behavior.
- [x] Add EQ curve preview graph.
- [x] Persist named user EQ presets.
- [x] Bring EQ support to native output.
- [x] Add true audio device selection so users can choose DACs, headphones, and speakers explicitly.
- [x] Implement gapless playback for albums, live recordings, DJ mixes, and classical works.
- [x] Add `Gapless` control beside `Boost` in the player row.
- [x] Upgrade `Gapless` from UI/state toggle to true seamless transition playback.
- [x] Show playback signal details in the player (`format`, `sample rate`, `bit depth`, `channels`, `bitrate`).
- [x] Upgrade the native audio path so effects and playback behavior match web output more closely.
- [x] Build a modular DSP chain for EQ, bass boost, preamp, limiter, crossfeed, and future effects.
- [x] Add `Play next`, `Queue next`, `Play from here`, `Stop after current`, and `Clear played`.
- [x] Add the ability to LIKE a song and then have it show up on the Liked Playlist
- [x] Filter Library by Genre
- [x] De-dup playlist, have a clean up button that removes duplicate tracks
- [ ] Unknown title should show up in the U section
- [ ] Add a new tab to explore your most loved artists and recently played songs.
- [ ] Add Create Playlist from search results for quick playlist creation
- [x] Metadata should be clickable and take to the search - eg. if you click the album name you should get the album tracks. or you click the Artist name, etc etc
- [ ] Track info sidebar, shows album art, year released, tracklist and lyrics
### P1 - Library and Album Listening
- [ ] Expand metadata support for `album artist`, `track number`, `disc number`, `composer`, and `genre`.
- [ ] Add album-centric browsing views for `Albums`, `Artists`, and `Genres`.
- [ ] Group library playback around album order, not just track search.
- [ ] Add folder art / album art coverage improvements where embedded art is missing.
- [ ] Search sort by Genre
- [ ] Add https://github.com/hvianna/audioMotion-analyzer to replace the EQ visualizer

### P2 - Loudness, Queue, and Listening Controls
- [ ] Add ReplayGain support with `track gain` and `album gain` modes.

- [ ] Add optional crossfade after gapless playback is stable.
- [ ] Add a clipping / peak indicator and better signal metering.

### P3 - Native Audio and DSP Architecture

- [ ] Add importable / savable DSP presets.
- [ ] Evaluate exclusive / hog mode support where platform APIs allow it.
- [x] Replace the old boost toggle with one cycling control: `Boost Off`, `Boost+`, `Boost++`.

## Acceptance Criteria Tracking
- [ ] Installable via `cargo install` path without extra proprietary runtime dependencies.
- [ ] Idle resource targets met (<100MB RAM, <1% CPU).
- [x] No telemetry or account requirements.
- [ ] Metadata auto-fill updates missing fields after background operation.
- [ ] UI remains minimal and uncluttered.

## UI/UX Checklist

- [x] Indexed Tracks is sortable and searchable

# Modern Apple App Design Checklist

Here is your 2026 UI/UX audit checklist to ensure your app feels cutting-edge.

1. Interaction & Motion
Predictive Navigation: Use AI to highlight the button the user is most likely to click next based on their habits (e.g., subtle pulsing or a slight color shift).

Micro-Gestures: Beyond swipes, incorporate haptic-rich interactions. Every scroll or toggle should have a distinct physical "click" feel through the phone's vibration motor.

Variable Refresh Rates: Ensure your animations are optimized for 120Hz+ displays. Movement should be fluid, mimicking organic physics rather than linear transitions.

2. Visual Aesthetic (The "Post-Glass" Era)
Dynamic Mesh Gradients: Move away from solid colors. Use shifting, blurred gradients that react to the time of day or the user's current mood/activity.

Bento Box Layouts: Use modular, rounded containers to organize information. This remains the gold standard for scannability and responsive scaling.

Neomorphic Depth 2.0: Not the extreme "soft plastic" look of years past, but subtle shadows and inner glows that give elements a physical, tactile presence.

Adaptive Dark Mode: Don't just flip white to black. Implement "True Dark" for OLED screens (pure blacks) with adjustable contrast levels for accessibility.

3. The "Intelligence" Layer
Zero-State Personalization: Your "Empty State" screens shouldn't be empty. They should offer smart suggestions or "Quick Starts" based on past data.

Natural Language Input: Replace complex forms with a single "Ask me anything" bar that can parse data and fill out fields automatically.

Contextual Awareness: The app should change its UI based on location or hardware state (e.g., "Driving Mode" with larger buttons, or "Focus Mode" with muted notifications).

4. Typography & Content
Variable Typefaces: Use fonts that can dynamically adjust weight and width to fit any screen size perfectly without "breaking" the layout.

Micro-Copy with Personality: Ditch the robotic "Error 404" or "Success." Use a tone of voice that feels human, witty, and aligned with your brand.

Data Scrimming: Instead of massive tables, use interactive mini-charts that reveal details only when hovered over or tapped.

Based on the Apple Style Guide, here's a checklist for your designer to create an app that feels like a modern Apple product:

## Visual & Interface Design

- [x] Use system fonts (San Francisco on macOS/iOS, appropriate typeface for platform)
- [x] Implement Dark Mode and Light Mode appearances
- [x] Use semantic colors that adapt to light/dark environments
- [x] Include proper spacing and hierarchy in layouts
- [ ] Design for accessibility (sufficient contrast, readable text sizes)
- [ ] Use SF Symbols for consistent iconography
- [x] Implement proper button states (normal, hover, active, disabled)

## Interaction Patterns

- [ ] Use standard gestures: tap, swipe, long press, pinch
- [ ] Include haptic feedback where appropriate
- [x] Implement smooth animations and transitions
- [x] Use standard controls: buttons, checkboxes, radio buttons, sliders
- [x] Design clear visual feedback for user actions
- [ ] Follow platform-specific navigation patterns

## Content & Language

- [x] Use sentence-style capitalization in UI text (except proper names)
- [x] Write concise, action-oriented button labels
- [ ] Avoid jargon; use plain language
- [ ] Use contractions naturally in interface text
- [ ] Capitalize feature names consistently
- [ ] Write inclusive, accessible copy

## Platform Consistency

- [ ] Match the design language of the target platform (iOS, macOS, watchOS, etc.)
- [ ] Use native controls instead of custom ones
- [ ] Follow Human Interface Guidelines for your platform
- [x] Respect system settings (accessibility, appearance preferences)
- [ ] Support Dynamic Type for text sizing

## Polish & Details

- [x] Ensure consistent corner radius across UI elements
- [x] Use appropriate shadow and depth effects
- [x] Design for edge cases and error states
- [x] Include loading and progress indicators
- [ ] Test on multiple device sizes and orientations

## Playlists

- [x] Create or save a playlist from the current queue.
- [x] Add library tracks to the selected playlist.
- [x] Import `.m3u` playlists by drag and drop.
- [x] Reorder the queue with drag and drop.
- [x] Shuffle the current queue without interrupting the current track.

In a Rust/Tauri environment, the trick is ensuring the UI (Frontend) stays snappy while the State (Backend/Rust) remains the "source of truth" for what song plays next.1. Create PlaylistAction: User clicks "New Playlist" or "Save Current Queue."Backend Logic: * Generate a new .m3u file in ~/.OpenAmp/playlists/.Register the new file in the SQLite metadata.db for quick sidebar access.UI: An editable text field appears in the sidebar to name the playlist.2. Add to PlaylistMethod A (External): Dragging files from macOS Finder or Linux File Manager (e.g., Dolphin/Nautilus) directly into a playlist name.Method B (Internal): Right-click a song in the "Library" view → "Add to Playlist" → [Select Name].Technical Handling: * The app must resolve the Path to the file immediately.Tauri's on_drag_drop handler parses the file paths and appends them to the end of the target .m3u file.3. Drag and Drop ReorderingUser Experience: Classic "grab and slide." A visual line indicates where the track will land.Frontend Logic: Use a library like dnd-kit or SortableJS. It’s purely visual until the user "drops."Backend Update: * On "Drop," the Frontend sends the new index array to Rust.The Swap: Rust rewrites the .m3u file with the new sequence.Note: This must be atomic to prevent the playlist from clearing out if the app crashes mid-save.4. Shuffle PlaylistThe "Winamp" Way (Linear Shuffle): 1.  The user toggles the Shuffle button.2.  The app generates a "shuffled index" of the current playlist.3.  If a song is currently playing, it becomes "Index 0" of the new shuffled sequence so the music doesn't jump.The "iTunes" Way (Random Jump):The playlist stays in its visual order.When a song ends, the app picks a random integer between $0$ and $N$ (playlist length) that hasn't been played in the current session.

## Music Player UI Must Have Checklist
Core Layout

- [x] Rounded card container
- [x] Dark background surface
- [x] Window style header area
- [x] Consistent internal padding
- [x] Left and right content columns

Header

- [x] Three window control dots (red, yellow, green)
- [x] Centered player title text
- [x] Subtle header separation from content

Audio Visualizer

- [x] Animated vertical bars
- [x] At least 16 bars for smooth movement
- [x] Gradient colored bars (yellow to green)
- [x] Real time animation driven by audio data

Track Metadata

- [x] Song title display
- [x] Artist name display
- [x] Clear hierarchy (title larger than artist)
- [x] Proper spacing between text elements

Volume Control

- [x] Speaker icon
- [x] Horizontal slider
- [x] Draggable volume thumb
- [x] Visual fill showing current volume

Progress Bar

- [x] Track progress indicator
- [x] Background track
- [x] Filled progress line
- [x] Scrubbable handle

Playback Controls

- [x] Shuffle button
- [x] Previous track button
- [x] Play / pause button
- [x] Next track button
- [x] Repeat button

Utility Controls

- [x] Playlist or library button
- [x] Equalizer/settings button
- [x] Special action icon (lightning icon in design)

Icon System

- [x] Consistent icon style
- [x] Equal icon alignment
- [x] Hover states
- [x] Active states for toggled controls

Interaction

- [x] Play button toggles play and pause
- [x] Volume slider updates audio level
- [x] Progress bar scrubbing updates playback time
- [x] Shuffle and repeat maintain state

Visual Feedback

- [x] Hover highlight on controls
- [x] Active state color change (green accent)
- [x] Subtle button press animation

Accessibility

- [x] All buttons keyboard accessible
- [x] Focus states visible
- [x] Buttons include aria labels
- [x] Volume and progress sliders accessible

Audio System

- [x] Audio element or audio engine
- [x] Playback state tracking
- [x] Time tracking for progress bar
- [x] Integration with visualizer analyzer

Performance

- [x] Visualizer updates using requestAnimationFrame
- [x] Avoid layout reflow in animations
- [ ] Lightweight icon set (SVG recommended)
