# CoreAmp Frontend Migration to Vue 3 + VibeUI — Design

- **Date**: 2026-06-02
- **Status**: Approved (design); pending implementation plan
- **Branch**: `epic/vibeui-migration`
- **Author**: migration design session

## Motivation

The current frontend is a single hand-written `coreamp-app/dist/index.html`
(~12,500 lines, 453 KB) of vanilla JS with no build step. Transport controls
(next / play-pause) intermittently become unresponsive. Root-cause analysis
identified two structural causes that are symptoms of the architecture, not
isolated defects:

- **H-A — `togglePlayback` fall-through.** State (`preferNativePlayback`,
  `nativeAudioAvailable`, queue, index) lives as loose mutable vars in one
  closure. When `togglePlayback` reads a transient/empty `native_audio_status`
  mid-click, it falls through to a web `<audio>` path whose `src` was cleared,
  misses every branch, and silently no-ops or restarts the track.
- **H-B — no re-entrancy guard.** Async transport handlers (`await invoke(...)`)
  have no in-flight lock, so rapid clicks launch concurrent `playTrack`
  invocations that race `native_audio_play`/`stop` and wedge playback.

These are not fixable in isolation without re-implementing the logic correctly.
The frontend is also untestable: transport functions are closure-local inside
the inline `<script>`, not importable, and macOS uses WKWebView (no Playwright /
tauri-driver e2e support). The decision is a full rebuild on a real component
framework: **Vue 3 + the `@velkymx/vibeui@1.0.2` component library**, with
correctness-by-construction (types + reactivity) eliminating these bug classes.

## Goals

- Rebuild the entire current UI, preserving the existing Apple-dark layout and
  behavior, using VibeUI components for all chrome.
- Keep the Rust backend (~39 Tauri commands) unchanged; it is the stable API.
- Make UI logic unit-testable (vitest + Vue Test Utils).
- Structurally eliminate H-A and H-B via a single source of truth (Pinia) and
  reactive bindings.

## Non-Goals

- No redesign of the visual aesthetic (keep current look).
- No backend / Rust changes (separate from the code-review findings already in
  flight on other branches).
- No new product features beyond current parity.

## Strategy: Big-Bang Rewrite

Chosen over incremental. Build the complete Vue app on `epic/vibeui-migration`,
swap `dist` at cutover when at parity. The legacy `dist/index.html` keeps
working on `release/0.4.0` until then. Rationale: user preference for a clean
end state without a dual-stack interim.

## Architecture & Build Tooling

### Project layout
```
coreamp-app/
  frontend/                # NEW Vite + Vue source (authored)
    index.html             # Vite entry (replaces hand-written dist/index.html)
    package.json
    vite.config.ts
    tsconfig.json
    src/
      main.ts              # createApp + VibeUIPlugin + Pinia + bootstrap CSS
      App.vue              # root shell (navbar + tabs)
      api/tauri.ts         # typed wrappers over the ~39 invoke() commands
      stores/              # Pinia stores
      components/          # PlayerBar + children, ui/, modals
      views/               # Home, Library, Liked, Playlists, Audio, Settings
      vendor/              # relocated visualizer libs (audioMotion, orb)
  dist/                    # BUILD OUTPUT (Vite writes here; Tauri serves it)
  src/main.rs              # Rust backend UNCHANGED
  tauri.conf.json          # build hooks updated
```

### Stack
- Vue 3 + Vite + **TypeScript** (strict). VibeUI ships `.d.ts`; types make the
  H-A desync state untypeable.
- Dependencies: `@velkymx/vibeui@1.0.2` and its peers `vue@^3.5`,
  `bootstrap@^5.3`, `bootstrap-icons@^1.11`, `dompurify@^3`, `quill@^2`.
- **Pinia** for cross-cutting state.

### Tauri config changes (`tauri.conf.json`)
- `build.beforeDevCommand`: `npm --prefix frontend run dev`
- `build.devUrl`: `http://localhost:1420`
- `build.beforeBuildCommand`: `npm --prefix frontend run build`
- `build.frontendDist`: `dist` (unchanged target)
- **CSP**: Vue templates are precompiled at build time (no runtime compiler),
  so **`'unsafe-eval'` is removed** from `script-src` (closes review finding
  S2). Keep `asset:`, `ipc:`, and the GitHub `connect-src` entries. The
  runtime asset-protocol scoping from the C6 work is unaffected.

### Backend boundary
Untouched. `api/tauri.ts` is the only module that calls `invoke`. It exposes
typed functions (e.g. `nativeAudioStatus(): Promise<NativeStatus>`) wrapping the
existing commands. The whole UI talks only through this layer.

Command contract to preserve (enumerated from current frontend):
`app_version, append_to_playlist, clear_history, dedup_playlist,
delete_playlist, get_settings, import_playlist_file, library_count,
list_albums, list_artists, list_genre_summaries, list_genres, list_library,
list_native_output_devices, list_playlists, list_recently_played,
list_top_artists, load_playlist, native_audio_pause, native_audio_play,
native_audio_resume, native_audio_selected_output_device,
native_audio_set_dsp_settings, native_audio_set_output_device,
native_audio_set_volume, native_audio_status, native_audio_stop,
pick_scan_paths, playlist_contains, read_track_artwork,
read_track_signal_details, record_play, save_playlist, save_settings,
scan_library, scan_paths, toggle_liked, update_track_metadata_for_path,
write_missing_tags_for_path`.

## Component Breakdown

Each SFC has a single responsibility and is capped at ~150 lines.

```
App.vue                      # shell: VibeNavbar + VibeTabs, mounts views
├─ PlayerBar.vue             # player panel (VibeCard)
│   ├─ NowPlaying.vue        # art/title/subtitle/signal details + Like (VibeIcon)
│   ├─ TransportControls.vue # prev/play-pause/next/shuffle/repeat (VibeButton/ButtonGroup)
│   ├─ ProgressBar.vue       # scrub (VibeSlider)
│   ├─ VolumeControl.vue     # speaker + slider (VibeSlider)
│   ├─ OutputControls.vue    # boost cycle / gapless (VibeButton/FormSwitch)
│   └─ Visualizer.vue        # OWN COMPONENT — orb / audioMotion host (impl: open item)
├─ views/
│   ├─ HomeView.vue          # dashboard: top artists / recently played (VibeCard grid)
│   ├─ LibraryView.vue       # segmented Tracks/Artists/Albums/Genres (VibeTabs/ButtonGroup)
│   │   ├─ TrackTable.vue        # (VibeDataTable + VibePagination)
│   │   ├─ SummaryGrid.vue       # artist/album/genre cards (VibeCard)
│   │   └─ TrackContextMenu.vue  # the "..." actions (VibeDropdown)
│   ├─ LikedView.vue         # reuses TrackTable
│   ├─ PlaylistsView.vue     # browser (VibeListGroup) + Queue.vue (VibeSortable)
│   ├─ AudioView.vue         # EQ + devices + DSP
│   │   ├─ EqPanel.vue           # band sliders (VibeSlider) + presets (VibeFormSelect)
│   │   ├─ EqGraph.vue           # OWN COMPONENT — curve (impl: open item)
│   │   └─ DeviceControls.vue    # output device (VibeFormSelect), DSP toggles (VibeFormSwitch)
│   └─ SettingsView.vue      # scan interval/proxy/import/update (VibeForm* + VibeButton)
└─ ui/
    ├─ StatusToast.vue       # status messages (VibeToast / useToast)
    └─ modals: SavePlaylist, EditMetadata, ConfirmDialog (VibeModal)
```

**Data flow**: props **down**, `emit` **up**. Pinia only for genuinely
cross-cutting state. No prop-drilling, no global grab-bag.

## State Management (Pinia)

Single source of truth replaces the loose closure vars that caused H-A.

```
stores/
  player.ts     # queue, currentIndex, shuffle/repeat, isPlaying,
                #   source: 'native' | 'web', nativeAvailable, signal details,
                #   inFlight (re-entrancy lock)
  library.ts    # tracks, paging, segmented view, search / genre filter
  eq.ts         # bands, preset, enabled, boost mode, gapless
  settings.ts   # scan interval, proxy, devices
```

### One-directional data flow
```
component event → store action → api/tauri.ts (invoke) → backend
backend state / events → store (reactive) → components re-render
```

### How this eliminates the reported bugs
- **H-A**: `player.togglePlayback()` is a pure store action branching on
  authoritative `source` + `isPlaying`, never on a transient `invoke` read taken
  mid-click. Deterministic and unit-testable.
- **H-B**: `player.inFlight` flag; transport actions early-return while a
  transition is pending; the flag is released in a `finally`, so a failed
  transition can never wedge the buttons.
- Manual DOM sync (e.g. `setToggleIcon`) is **deleted**: the icon binds to
  `player.isPlaying`.

### Events / async sources (wired in store init)
- `native_audio_status` polling → updates `player.isPlaying` / `source`.
- Tauri `listen("daemon://event")` and `listen("tray://control")` → store
  actions.

## Error Handling

- `api/tauri.ts` is the only place `invoke` is called. Each wrapper resolves
  typed data or throws a normalized `TauriError { command, message }`. No
  `.catch(() => {})` swallowing at the boundary.
- **Stores** own try/catch: an action catches, sets store error state, and
  surfaces it via `StatusToast` (`useToast`). Failures are always visible.
- **Native → web fallback preserved**: on native playback failure, flip
  `source = 'web'`, toast the reason, retry on web — explicit and logged, not
  silent.
- **In-flight locks** released in `finally` so a failed transition never wedges
  the UI.
- **Event-listener errors** (e.g. `daemon://event` parse failure): logged +
  toast, never crash the store.

Principle: fail loud to the user; never leave the UI in a stuck or lying state.

## Testing & Verification

- **Unit (vitest + Vue Test Utils), TDD per store action and component.** The
  canonical first test is the `player.togglePlayback()` truth table:
  - native-playing → pause
  - native-paused → resume
  - web with src, playing → pause
  - web with src, paused → resume
  - idle + queued → play current
  - **desync (native selected, status empty) → deterministic action, never a
    silent no-op** (the H-A regression test)
  - re-entrancy: second call while `inFlight` → early return (H-B regression).
- **Component tests** — `TransportControls.vue`: a click dispatches the correct
  store action; the play/pause icon binds to `player.isPlaying` (no manual sync
  to drift).
- **Boundary mocking** — `api/tauri.ts` mocked with `vi.mock` so store tests are
  deterministic and never call real `invoke`.
- **CI** — add `npm --prefix frontend run test` and `vue-tsc` typecheck beside
  the existing `cargo fmt / clippy / test`. Every commit stays green.
- **Manual gate** — macOS uses WKWebView (no Playwright e2e). One documented
  smoke pass per milestone: launch the app, play a `~/Music` track, exercise the
  transport controls.
- **Coverage target** — every Pinia action and every component with logic.
  Pure-display SFCs need no test.

## Implementation Constraints

- **Review the VibeUI component docs before implementing each region.** Before
  building any view or control, consult the `@velkymx/vibeui` component
  documentation and its exported API (props, slots, events) for the relevant
  components. Do not infer behavior — verify it against the docs.
- **Always use a VibeUI component when one exists for the need.** Prefer the
  library component over hand-rolled markup or custom CSS widgets wherever VibeUI
  offers an equivalent (buttons, sliders, tabs, cards, lists, modals, dropdowns,
  tables, pagination, forms, toasts, etc.). Hand-rolling is permitted only when
  no VibeUI component covers the need (e.g. the orb and EQ-curve visualizers in
  the Open Items), and that gap must be called out in the plan.

## Open Items (resolve during planning)

1. **`Visualizer.vue` internals** — port the existing orb + audioMotion
   canvas/WebGL/Web-Audio code verbatim (wrapped in Vue lifecycle), or
   reimplement on VibeUI charts. Default lean: port-as-is (lowest risk).
2. **`EqGraph.vue` internals** — keep the custom curve canvas, or switch to
   `VibeChartLine`. Default lean: port-as-is.
3. Confirm the Web Audio graph + `<audio>` element lifecycle mapping into Vue
   component lifecycle (single owner vs per-component).

## Risks

- Vite owns `index.html`; the current `dist/index.html` is deleted at cutover —
  the big-bang moment. Mitigated by doing all work on the epic branch.
- Bootstrap 5.3 base styling vs the current Apple-dark aesthetic requires CSS
  overrides to preserve the look.
- Visualizer / Web-Audio porting is the highest-risk area (open items above).
- Big-bang has a long no-ship window and parity bugs surface together at
  cutover; mitigated by per-component TDD and a milestone smoke gate.
```
