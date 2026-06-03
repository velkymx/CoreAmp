# CoreAmp TODO

Forward-looking backlog only.

Completed work belongs in `CHANGELOG.md`.

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
* [ ] Log persistent metadata-enrichment failures.

## Stability

* [ ] Verify multi-process database access behavior.

## Build & Release

* [ ] Fix `cargo tauri build` path issue.
* [ ] Complete full application smoke test.
* [ ] Verify installable release workflow.

---

# P1 - Core Player Parity

Features users expect from a modern desktop music player.

## System Integration

* [ ] Wire tray controls into playback state.
* [ ] Wire daemon events into frontend stores.
* [ ] Add update checking UI.
* [ ] Add update installation UI.
* [ ] Add media key support.
* [ ] Add system now-playing integration.

## Themes & Accessibility

* [ ] Add Light theme.
* [ ] Add Dark theme.
* [ ] Add in-app theme toggle (System / Light / Dark).
* [ ] Complete Apple-dark visual polish pass.
* [ ] Respect `prefers-reduced-motion`.
* [ ] Reduce animation intensity when reduced motion is enabled.

## Audio

* [ ] Save user EQ presets.
* [ ] Delete user EQ presets.
* [ ] Add Hip-Hop EQ preset.
* [ ] Add Dance EQ preset.
* [ ] Verify boost processing parity.
* [ ] Verify limiter processing parity.
* [ ] Verify crossfeed processing parity.

## Library

* [ ] Folder artwork fallback support.
* [ ] Album artwork fallback support.
* [ ] Album-centric browse and play-in-order workflow.
* [ ] Fix duration backfill for tracks added through explicit path import.
* [ ] Mobile and small-window layout support.

## Playback

* [ ] Play From Here.

---

# P2 - Power User Features

## Track Information

* [ ] Track details sidebar.
* [ ] Album details panel.
* [ ] Year display.
* [ ] Tracklist display.

## Metadata Management

* [ ] Album artist editing.
* [ ] Track number editing.
* [ ] Disc number editing.
* [ ] Composer editing.
* [ ] Genre editing.

## Library Browsing

* [ ] Sort by Title.
* [ ] Sort by Artist.
* [ ] Sort by Album.
* [ ] A-Z / Z-A toggle.
* [ ] Search sort by genre.
* [ ] Unknown-title grouping under U.
* [ ] Recently Added view.

## Playlists

* [ ] Save search as playlist.
* [ ] Add queue to selected playlist.
* [ ] Smart Liked playlist.

## Import Experience

* [ ] Choose files picker.
* [ ] Explicit path entry.
* [ ] File and folder drop zone.

## Player UX

* [ ] Expanded showcase player.
* [ ] Dedicated showcase transport controls.
* [ ] Enhanced now-playing presentation.

---

# P3 - Audiophile Features

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

## Monitoring

* [ ] Peak meter.
* [ ] Clipping meter.
* [ ] Advanced signal metering.

## Hardware Integration

* [ ] Evaluate exclusive mode support.
* [ ] Evaluate hog mode support.

## Education

* [ ] Audio signal-path diagram.

---

# P4 - Visualizer Expansion

## Reactive Visualizers

* [ ] Vortex.
* [ ] Nebula.
* [ ] Storm.

## Interactive Visualizers

* [ ] Shapes dodge game visualizer.

## Future Evaluation

* [ ] 1/8 Octave spectrum.
* [ ] Graph spectrum.
* [ ] Discrete spectrum.
* [ ] Mirror spectrum.
* [ ] Mirror Split spectrum.
* [ ] Radial spectrum.
* [ ] Radial Graph spectrum.
* [ ] Lumi Bars spectrum.
* [ ] LED Bars spectrum.

---

# P5 - Experimental / Superpowers

## Cast & Catch

* [ ] Fishing game.
* [ ] Audio-reactive gameplay.
* [ ] Progression and scoring systems.

## Beat Hero

* [ ] Beat detection.
* [ ] Onset detection.
* [ ] Home-row note mapping.
* [ ] Typing trainer mode.
* [ ] Score and progression systems.

## Future Listening Features

* [ ] Lyrics view.
* [ ] Sleep timer.

---

# Continuous Engineering

## Platform

* [ ] Improve IPC scalability.
* [ ] Improve event handling architecture.
* [ ] Improve background task infrastructure.

## Database

* [ ] Migration cleanup.
* [ ] Query optimization.
* [ ] Connection management improvements.

## Code Quality

* [ ] Remove duplicated indexing logic.
* [ ] Consolidate metadata helpers.
* [ ] Improve structured error handling.
* [ ] Expand automated test coverage.

## UX Polish

* [ ] Global busy/loading state.
* [ ] Dynamic tray labels.
* [ ] Better error reporting.


# TODO Additions

## P1 - Core Player Parity

### Metadata Enrichment

* [ ] Fill missing metadata from MusicBrainz.
* [ ] Fill missing release year.
* [ ] Fill missing album artist.
* [ ] Fill missing track numbers.
* [ ] Fill missing disc numbers.
* [ ] Fill missing genre when confidence is high.
* [ ] Preview metadata changes before applying.
* [ ] Bulk metadata enrichment for selected tracks.
* [ ] Bulk metadata enrichment for albums.
* [ ] Surface metadata enrichment failures in the UI.

### Artwork

* [ ] Download missing album artwork from Cover Art Archive.
* [ ] Cache downloaded artwork locally.
* [ ] Refresh artwork on demand.
* [ ] Allow manual artwork replacement.

---

## P2 - Power User Features

### Metadata Management

* [ ] Album artist editing.
* [ ] Track number editing.
* [ ] Disc number editing.
* [ ] Composer editing.
* [ ] Genre editing.
* [ ] Batch metadata editing.

### Lyrics

* [ ] Lyrics view.
* [ ] Support local `.lrc` lyric files.
* [ ] Auto-load sidecar `.lrc` files.
* [ ] Display synchronized lyrics when timestamps exist.
* [ ] Display plain-text lyrics when timestamps are absent.
* [ ] Remember lyric display preference per user.

---

## P3 - Audiophile Features

### Metadata Providers

* [ ] Complete MusicBrainz integration.
* [ ] Complete Cover Art Archive integration.
* [ ] Evaluate Discogs fallback provider.
* [ ] Cache metadata lookups locally.
* [ ] Avoid repeated lookups for previously failed matches.

---

## P4 - Ship Blockers

### Networking

* [x] Add MusicBrainz request rate limiting.
* [ ] Update MusicBrainz user-agent string.
* [ ] Add contact information to MusicBrainz requests.
* [ ] Log persistent metadata-enrichment failures.

### Library

* [ ] Fix duration backfill for tracks added through explicit path import.

### DSP Performance

N/A under the current web-only output (native rodio DSP path is bypassed; web
EQ uses Web Audio `AudioParam`). Revisit if native output is re-enabled.

* [x] Eliminate DSP coefficient recomputation on every sample. (N/A — native path disabled)
* [x] Debounce EQ updates during slider drag. (N/A — web EQ is cheap AudioParam)
* [x] Prevent DSP state reallocations during active playback. (N/A — native path disabled)

### Cutover

* [ ] Merge `epic/vibeui-migration` into the release branch.
* [ ] Verify migrated functionality against CHANGELOG.
* [ ] Confirm `dist` contains build output only.

