# CoreAmp TODO

Act as a Principal Systems Architect and Maintainer for the CoreAmp project. Your mission is to maintain a high-performance Tauri 2.x application, consisting of a Rust-based workspace (coreamp-common, coreamp-app, coreamp-daemon) and a high-performance Vue 3 + VibeUI 1.0.2 dashboard. You prioritize "The VibePlayer Way" for systems code (zero-cost abstractions, fearless concurrency) and "The VibeUI Way" for the interface (shorthand props, composable slots), ensuring the entire stack remains ultra-fast, memory-safe, and minimalist.

#### Context Available
* Project repository: CoreAmp (Tauri 2.11.2, Rust workspace, Vue 3, Vite, VibeUI 1.0.2)
* Audio/System Logic: Rust (`cpal`, `rodio`, `lofty`), lock-free audio threading
* Interface: VibeUI 1.0.2, Bootstrap 5.3, Vanilla JS
* Infrastructure: RTK (https://www.rtk-ai.app/docs/) for intelligent frontend-backend orchestration
* Standards: VibeUI LLM Rules (https://github.com/velkymx/vibeui/blob/1.0-main/llms.txt)

#### Iterative Workflow
For each cycle, follow this sequence:
1. Task Selection: Identify the next incomplete item in `coreamp-app/frontend/TODO.md`. Do not batch tasks.
2. Architecture Plan: Provide a 1-2 sentence plan citing the specific Rust primitive (e.g., `Arc`, `Atomic`), VibeUI component/pattern, or RTK orchestration logic to be used.
3. Test-Driven Development (Strictly Native):
    * Rust: Use `cargo test`. Never use `true == true` assertions.
    * Frontend: Use `vitest`. Never use `true = true` assertions or mocks to bypass logic.
    * Confirm the new test fails, then implement production code until it passes.
4. Production Implementation: Write minimal, production-grade code. Ensure all code is fully functional, complete, and devoid of placeholders.
5. Framework Leverage:
    * Rust Workspace: Utilize zero-copy parsing and lock-free thread safety per Tauri 2.11.2 specs.
    * Frontend: Utilize VibeUI 1.0.2 components via Vite, favoring composable slots for complex layouts.
    * Orchestration: Use RTK to handle complex data fetching and state synchronization between the Rust backend and Vue frontend.

#### Strict Engineering Rules
* VibeUI 1.0.2 Integration: All UI components must strictly adhere to VibeUI 1.0.2 standards (buttons should be VibeButtons, Rows should be VibeRows, etc.).
* Performance-First Design:
    * Rust: Lock-free audio threads, stack allocation, heap-clone avoidance.
    * Frontend: Minimal DOM nodes, optimized Vite asset compilation, efficient VibeUI component usage.
* Minimalist Philosophy: Do not introduce new dependencies or abstractions unless there is an absolute functional necessity. If you believe refactoring is required, you MUST ask for user approval and explain the "why" and "how" (addressing performance impact) first.
* No Placeholders: Return full, complete files. Never use `// TODO`, `/* logic here */`, or shorthand.
* Scope Discipline: Strictly modify only files relevant to the current task. Follow existing workspace/namespace conventions.

#### Git and Version Control
* Verification: Run `cargo test` or `npm run test` (as appropriate) to confirm all tests pass before committing.
* Atomic Commits: Execute one git commit per item immediately upon passing tests.
* Completed work belongs in `CHANGELOG.md`. Move completed checked items to the CHANGELOG.md in the format (YYYY-MM-DD To Do Title - Short Description)
* DO NOT COMMIT THE TODO.md or CHANGELOG.md

---

# P0 - Core Ship Blockers

Must be completed before the next stable release.

## Performance

* [x] Remove database lock bottlenecks during scanning and metadata operations.
* [x] Eliminate full-library metadata hash loading during scans.
* [x] Stop re-reading audio files during library browsing.
* [x] Move library scanning off UI and IPC threads.
* [x] Prevent symlink recursion during scans.
* [x] Improve large-library responsiveness.

## DSP Performance

N/A under the current web-only output (native rodio DSP path is bypassed; web
EQ uses Web Audio `AudioParam`). Revisit if native output is re-enabled.

* [x] Eliminate DSP coefficient recomputation on every sample. (N/A — native path disabled)
* [x] Debounce EQ updates during slider drag. (N/A — web EQ is cheap AudioParam)
* [x] Prevent DSP state reallocations during active playback. (N/A — native path disabled)

## Security

* [x] Restrict asset protocol access to approved library/config locations.
* [x] Harden production CSP configuration.

## Networking

* [x] Add MusicBrainz request rate limiting.
* [x] Update MusicBrainz user-agent string.
* [x] Add contact information to MusicBrainz requests.
* [x] Log persistent metadata-enrichment failures.

## Stability

* [x] Verify multi-process database access behavior.

## Build & Release

* [x] Fix `cargo tauri build` path issue.

---

# P1 - Core Player Parity

Features users expect from a modern desktop music player.

## Themes & Accessibility

* [x] Add Light theme.
* [x] Add Dark theme.
* [x] Add in-app theme toggle (System / Light / Dark).
* [ ] Complete Apple-dark visual polish pass.
* [ ] Visualizer Full Frame with Mini-Player Controls

## Library Browsing

* [x] Play From Here.
* [x] Play Track Next (add to queue as next track) (row menu: Play next)
* [x] Sort by Title. (VibeDataTable column sort)
* [x] Sort by Artist. (VibeDataTable column sort)
* [x] Sort by Album. (VibeDataTable column sort)
* [x] A-Z / Z-A toggle. (VibeDataTable asc/desc)
* [x] Search sort by genre. (sortable Genre column)
* [ ] Unknown-title grouping under U.
* [ ] Recently Added view.
* [x] Fix duration backfill for tracks added through explicit path import.
* [ ] Mobile and small-window layout support.
* [ ] Album artist editing.
* [ ] Track number editing.
* [ ] Genre editing.
* [ ] Year editing.
* [x] Dedup Playlist (Playlists tab funnel button)
* [ ] Dedup LibraryPlay

## Playlists

* [ ] Save search as playlist.
* [ ] Add queue to selected playlist.
* [ ] Smart Liked playlist.

## Audio

* [x] Save user EQ presets.
* [x] Delete user EQ presets.
* [ ] Add Hip-Hop EQ preset.
* [ ] Add Dance EQ preset.
* [ ] Verify boost processing parity.
* [ ] Verify limiter processing parity.
* [ ] Verify crossfeed processing parity.

## ReplayGain

* [ ] ReplayGain track mode.
* [ ] ReplayGain album mode.

## Gapless Playback

* [ ] Native backend gapless support.
* [ ] Gapless playback toggle.
* [ ] Gapless validation testing.

## Crossfade

* [ ] Crossfade engine.
* [ ] Crossfade controls.
* [ ] Crossfade tuning.

* [ ] Sleep timer.

##  Intergration

* [ ] Add update checking UI. (is there an updater package?)
* [ ] Add update installation UI.
* [ ] Add system now-playing integration.

---

# P2 - Power User Features

## Track Information

* [ ] Track details sidebar.
* [ ] Album details panel.
* [ ] Year display.
* [ ] Tracklist display.

## Import Experience

* [ ] Choose files picker.
* [ ] Explicit path entry.
* [ ] File and folder drop zone.
* [ ] Complete MusicBrainz integration.
* [ ] Complete Cover Art Archive integration.
* [ ] Cache metadata lookups locally.
* [ ] Avoid repeated lookups for previously failed matches.
* [ ] Show a status in the updater UI when importing (with a spinner)
* [ ] Download missing album artwork from Cover Art Archive.
* [ ] Cache downloaded artwork locally.
* [ ] Refresh artwork on demand.
* [ ] Allow manual artwork replacement.

## Code Quality

* [ ] Remove duplicated indexing logic.
* [ ] Consolidate metadata helpers.
* [ ] Improve structured error handling.
* [ ] Expand automated test coverage.

## UX Polish

* [ ] Global busy/loading state.
* [ ] Dynamic tray labels.
* [ ] Better error reporting.


## P4 - Ship Blockers

### Networking

* [x] Add MusicBrainz request rate limiting.

### DSP Performance

N/A under the current web-only output (native rodio DSP path is bypassed; web
EQ uses Web Audio `AudioParam`). Revisit if native output is re-enabled.

* [x] Eliminate DSP coefficient recomputation on every sample. (N/A — native path disabled)
* [x] Debounce EQ updates during slider drag. (N/A — web EQ is cheap AudioParam)
* [x] Prevent DSP state reallocations during active playback. (N/A — native path disabled)

## P5 Visualizer

#### ThreeJS Visualizers

Review the current implementations that already exist. They will all need to be converted into their own component to easy management. In addition to porting over the Storm, Orb, Vortex we need to review other projects for ideas on how best to do it.

Projects to review:

https://maximevermeeren.medium.com/threejs-objects-reacting-on-audio-1adca87ec71a
https://speckyboy.com/audio-visualization-code-snippets/
https://freefrontend.com/javascript-audio-visualizer/
https://codepen.io/prakhar625/pen/zddKRj
https://github.com/jhugheswebdev/sound-equalizer-threejs

* [ ] Orb
* [ ] Vortex
* [ ] Storm


### Games TBD

Do not start. These will have a breakdown of each. 

* [ ] Remove existing games entirely

Chicken Lander - See PRD
Keyboard Hero - See PRD