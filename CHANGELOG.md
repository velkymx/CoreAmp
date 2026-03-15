# Changelog

## [0.2.0] - 2026-03-14

### Added
- Visualizer overhaul: replaced Butterchurn/MilkDrop and hand-rolled bars with audioMotion-analyzer (Spectrum) and custom Three.js reactive visualizers
- 16 Spectrum sub-modes: 1/3 Octave, 1/12 Octave, 1/8 Octave, 1/6 Octave, 1/2 Octave, Full Octave, Graph, Discrete, 1/24 Octave, Mirror, Mirror Split, Radial, Radial Graph, Lumi Bars, LED Bars, Reflex
- 3 Reactive visualizer modes: Orb (iTunes-inspired shape), Vortex (spiral galaxy), Nebula (atmospheric clouds with cores and rays)
- Lens flare effect on treble spikes in Orb mode
- Motion trail rendering for all reactive modes
- Save search results as playlist ("+ Playlist" button appears during search)
- Dashboard tab with Top Artists and Recently Played (artwork grid cards)
- DevTools support for debug builds (feature-flagged)
- Vendor libs: audiomotion-analyzer.min.js, three.min.js (IIFE)
- Library UI redesign: consolidated 10 tabs to 6 (Home, Library, Liked, Playlists, Audio, Settings)
- Apple-style segmented control for Tracks/Artists/Albums/Genres within Library tab
- Album art thumbnails in track rows (40px, lazy loaded)
- Context menu ("...") replacing 8 inline action buttons per track
- Artwork grid cards for Artists, Albums, Genres summary views (Apple Music-style)
- Import panel merged into Settings tab

### Fixed
- CSP blocking tracks and IPC: corrected invalid `audio-src` to `media-src`, added `ipc:` to `connect-src`
- 40px top spacing gap caused by SVG sprite block above main
- Library scrolling: fixed flex layout for proper library panel scrolling
- Unknown titles now sort under "U" section instead of scattering by filename
- Track playback: reordered audio graph setup to happen before setting source
- Orb visualizer: bass drives scale/pulse, mids/treble drive shape morphing (no more jittery animation)
- Orb colors: deep vibrant palette with RGB channel clamping, no white wash-out

### Changed
- Queue column locked to 580px height
- Visualizer mode and sub-mode selections persist in localStorage across reloads
- Smoother vertex animation via position lerping (8-10% per frame)
- Audio smoothing: moderate attack (25%) / smooth release (8%) for reactive visualizers
