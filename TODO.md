# CoreAmp TODO

Act as a Principal Systems Architect and Maintainer for the CoreAmp project. Your mission is to maintain a high-performance Tauri 2.x application, consisting of a Rust-based workspace (coreamp-common, coreamp-app, coreamp-daemon) and a high-performance Vue 3 + VibeUI dashboard. You prioritize "The VibePlayer Way" for systems code (zero-cost abstractions, fearless concurrency) and "The VibeUI Way" for the interface (shorthand props, composable slots), ensuring the entire stack remains ultra-fast, memory-safe, and minimalist.

#### Context Available
* Project repository: CoreAmp (Tauri 2.11.x, Rust workspace, Vue 3, Vite, VibeUI 1.1.x)
* Audio/System Logic: Rust (`rodio`, `lofty`), lock-free audio threading
* Interface: VibeUI, Bootstrap 5.3, TypeScript 5.9
* Infrastructure: RTK (https://www.rtk-ai.app/docs/) for intelligent frontend-backend orchestration
* Standards: VibeUI LLM Rules (https://github.com/velkymx/vibeui/blob/1.0-main/llms.txt)

#### Iterative Workflow
For each cycle, follow this sequence:
1. Task Selection: Pick the next item from this list (top to bottom). Do not batch tasks.
2. Architecture Plan: 1-2 sentence plan citing the specific Rust primitive, VibeUI component/pattern, or RTK orchestration logic.
3. Test-Driven Development (strictly native):
   * Rust: `cargo test`. Never `true == true` assertions.
   * Frontend: `vitest`. Never `true = true` assertions or mocks that bypass logic.
   * Confirm the new test fails, then implement until it passes.
4. Production Implementation: Minimal, production-grade code. Complete files, no placeholders.
5. Framework Leverage: VibeUI components via Vite, zero-copy Rust parsing, lock-free thread safety, RTK orchestration.

#### Strict Engineering Rules
* VibeUI first: buttons are VibeButtons, rows are VibeRows, modals are VibeModal.
* Performance-first: lock-free audio, stack allocation, minimal DOM nodes, code-split bundles.
* Minimalist: do not introduce new dependencies or abstractions without an absolute functional necessity. If refactoring is required, ask first with "why" + "how" + performance impact.
* No placeholders: full files, no `// TODO`, no `/* logic here */`.
* Scope discipline: only files relevant to the current task.

#### Git and Version Control
* Verify: `cargo test` / `npm run test` must pass before commit.
* Atomic commits: one git commit per item on green tests.
* CHANGELOG: move completed items to `CHANGELOG.md` in format `YYYY-MM-DD Title - Short Description`.
* DO NOT COMMIT `TODO.md` or `CHANGELOG.md`.
* Exclusion filter: no `.md` files in commits.

---

# Foundational (do first — blocks everything below)

## 0.1 CI / Build Hygiene
* [x] **CI runs frontend test/lint/typecheck** (`.github/workflows/ci.yml`, `package.yml`): add `npm --prefix coreamp-app/frontend ci && npm test && npm run typecheck` job.
* [x] **No `cargo audit` / `npm audit` / Dependabot** (`.github/`): add `dependabot.yml` (cargo + npm + github-actions) + weekly audit job.
* [x] **GitHub Actions pinned by tag, not SHA** (`ci.yml`, `package.yml`): pin all `actions/*`, `dtolnay/*`, `Swatinem/*`, `softprops/*` to commit SHAs.
* [x] **No `[profile.release]` in workspace `Cargo.toml`**: add `lto = "thin"`, `codegen-units = 1`, `strip = "debuginfo"`, `panic = "abort"`.
* [ ] **Three independent `0.5.0` version strings** (`Cargo.toml:8`, `coreamp-app/tauri.conf.json:4`, `coreamp-app/frontend/package.json:4`): derive from `Cargo.toml` via `$CARGO_PKG_VERSION`; bump script for `package.json`.
* [x] **No `rust-toolchain.toml` / `.nvmrc` / pinned `tauri-cli`**: add to root + CI.
* [x] **No `.editorconfig`, `.gitattributes`, pre-commit hooks**: add `.editorconfig` (LF, 2-space), `.gitattributes` (`*.sh eol=lf`).
* [x] **`.gitignore` missing `*.min.js.map`, `.vite/`**: add patterns.
* [x] **Vite `sourcemap` not configured, no `manualChunks`, no `cssCodeSplit`**: `sourcemap: "hidden"`, `target: "es2022"`, `manualChunks: { vue, vibeui }`.
* [x] **`butterchurn*.min.js` is dead weight** (384KB shipped, 0 imports): delete + add vendor allowlist to CI.
* [x] **CI doesn't `chmod +x` packaging scripts**: add to verify job.
* [x] **No `engines` / `packageManager` in `package.json`**: add `"engines": { "node": ">=20.18" }` + `packageManager: "npm@10"`.
* [x] **No SemVer automation, no `CODEOWNERS`**: add `tagpr` or `release-please`; add `.github/CODEOWNERS`.
* [ ] **macOS bundle published as `.app.zip` only, no DMG**: add `create-dmg` step.
* [x] **Tauri `bundle.icon` missing 256×256 PNG + master `icon.png`**: add to `coreamp-app/icons/`.
* [x] **Tauri window missing `minWidth`/`minHeight`** (`tauri.conf.json:20-28`): add `minWidth: 800, minHeight: 700`.
* [ ] **`tauri.conf.json` missing `bundle.publisher` / `category` / `shortDescription`**: add for proper DMG/Info.plist.
* [ ] **No `cargo nextest` config** (`.github/workflows/ci.yml:42`): add `nextest profile ci`.

## 0.2 Security
* [ ] **Path traversal: arbitrary file read in `set_track_artwork`** (`coreamp-app/src/main.rs:685-706`): validate `image_path` + `track_path` against `asset_scope_roots()`; reject symlinks.
* [x] **Path traversal: arbitrary file read/write across 8+ IPC commands** (`main.rs:1041, 1101, 1121, 1131, 1176, 1217, 1308, 1713`): factor `validate_library_path(p)`; call on every path-arg command.
* [x] **`core:default` grants every core command** (`coreamp-app/capabilities/default.json:7`): list only plugin perms needed.
* [ ] **`assetProtocol.scope` placeholder `["$AUDIO/**"]`** (`tauri.conf.json:17`): remove or replace with env var.
* [ ] **macOS app is not sandboxed** (`packaging/macos/entitlements.plist:5-6`): enable `com.apple.security.app-sandbox` + `files.user-selected.read-write`.
* [ ] **No macOS code signing / notarization** (`build-app.sh:49, 55` + `package.yml:115-117`): require Developer ID + `notarytool submit --wait` + `stapler staple`.
* [ ] **No Windows code signing**: add `signtool` step + `WINDOWS_CERTIFICATE` secret.
* [ ] **`script-src 'unsafe-inline'` in CSP** (`tauri.conf.json:14`): drop; use `vite-plugin-csp` nonces/hashes.
* [ ] **Tauri updater pubkey rotation impossible** (`tauri.conf.json:50`): use multi-key array; document rotation runbook.
* [x] **`list_library_files` SQL built by String concat** (`coreamp-common/src/db.rs:251-281`): use `WHERE (?2 IS NULL OR genre = ?2)` predicates.
* [ ] **Symlink-based scope escape** (`db.rs:665`, `main.rs:691-698`): `canonicalize` + re-check scope.
* [ ] **`unchecked_transaction` in `clear_history` + `delete_missing_files`** (`db.rs:630, 652`): use `connection.transaction()`.
* [ ] **`next_event_id` non-atomic RMW** (`coreamp-common/src/ipc.rs:65-75`): SQLite `INSERT … RETURNING id` or `flock`.
* [ ] **Tauri command errors leak file paths to renderer** (`main.rs:691, 698, 733, …, 1250` + `error.rs:11-15`): add `to_user_error()`; log details only to `eprintln`.
* [ ] **`update_track_metadata_for_path` non-atomic** (`metadata.rs:369-451` + `main.rs:1216-1225`): write to sibling temp + rename, then DB commit.
* [x] **ReplayGain tag unbounded → audio clip / hearing damage** (`metadata.rs:275-281` + `main.rs:851-858`): clamp to ±24 dB in `read_replay_gain`.
* [x] **Asset protocol scope loaded non-atomically** (`main.rs:1888-1893`): propagate `tauri::Error`.
* [x] **`connect-src` whitelists github.com but no code uses it** (`tauri.conf.json:14`): drop unused origins.
* [ ] **DevTools gated by feature, not `cfg!(debug_assertions)`** (`main.rs:1894-1897`): assert debug-only.
* [ ] **Cargo deps use caret ranges, no `[workspace.dependencies]`** (`coreamp-app/Cargo.toml:16-23` + `coreamp-common/Cargo.toml:8-14`): move to workspace; add `cargo update` policy.
* [ ] **Vendored JS without SRI / origin check** (`public/vendor/*.min.js` + `loadVendor.ts:5-18`): add `integrity="sha384-…"` or upstream diff job.
* [ ] **Unbounded `limit` on list commands** (`main.rs:741, 817, 839, 867`): cap at 1000.
* [ ] **`save_playlist` + `append_to_playlist` have no cap** (`main.rs:1090-1118`): cap 50k paths; reject names > 200 chars.
* [x] **`set_tray_now_playing` no length cap** (`main.rs:727-737`): cap 256 chars.
* [ ] **Library PII leaks to stderr** (`library.rs:253, 267` + `coreamp-daemon/src/main.rs:89, 96, 121, 129, 136`): redact basename; write to `config_dir()` not `/tmp`.
* [x] **Daemon stdout prints full home dir** (`coreamp-daemon/src/main.rs:69, 145-148`): print only basename.
* [ ] **Webview console not forwarded to Rust log** (`main.ts:1-11`): `on_webview_event` / `WebviewEvent::Console` forward.
* [ ] **`localStorage` stores full track paths** (`util/queueStorage.ts:23`): persist IDs/UUIDs instead.
* [ ] **Tauri command latency not measured** (`tauri.ts:27-35`): wrap `call<T>` with timing.

## 0.3 Data Integrity
* [x] **`apply_schema` has no `PRAGMA user_version`** (`db.rs:119-163`): add versioned `MIGRATIONS: &[(&str, &str)]` table.
* [x] **No `PRAGMA integrity_check` / `quick_check` on DB open** (`db.rs:17-37`): torn write / ungraceful kill leaves WAL inconsistent.
* [x] **`OnceLock` caches DB init failure forever** (`db.rs:12, 23-37`): clear on `Err` or rename + retry.
* [x] **`save_settings` non-atomic** (`coreamp-common/src/settings.rs:35-39`): `settings.json.tmp` + `fs::rename`.
* [x] **No backup of corrupt `settings.json`** (`settings.rs:25-39`): rename to `.corrupt-<ts>` + `Ok(default())`.
* [ ] **App + daemon `load_settings` / `save_settings` without file lock** (`settings.rs:30-31` + `main.rs:1229, 1233` + `coreamp-daemon/src/main.rs:52, 140`): atomic write + `flock`.
* [ ] **`PersistedQueue` has no `version` field** (`queueStorage.ts:8-11, 23`): add `v: 1` envelope.
* [ ] **`UserEqPreset` shape unversioned + per-band unvalidated** (`audio/userEqPresets.ts:1-43`): wrap in `{v:1, presets:[…]}` + per-band validate.
* [ ] **`saveUserEqPreset` silently overwrites** (`userEqPresets.ts:34-39` + `stores/audio.ts:118-125`): "replace?" prompt.
* [ ] **`saveUserEqPreset` doesn't clamp gain/q** (`userEqPresets.ts:34`): clamp `gain ∈ [-24, 24]`, `q ∈ [0.1, 12]`.
* [ ] **No import/export for user EQ presets** (`stores/audio.ts:118-138` + `AudioView.vue:207-220`): add JSON download / upload.
* [ ] **`play_count`, `last_played_at`, `cover_url` never serialized** (`db.rs:97-99, 528` vs `main.rs:43-56`): add to `LibraryTrack` IPC payload.

## 0.4 Error Handling
* [x] **No global Vue error handler / unhandled rejection listener** (`src/main.ts:1-11`): wire `app.config.errorHandler` + `window.addEventListener("unhandledrejection", …)`.
* [ ] **No `app.config.errorHandler` for component throws**: route to `useNotify().error(...)`.
* [ ] **Dead Tauri event channels — Rust emits, no TS listener** (`main.rs:1909, 1945-1961`): `import { listen } from "@tauri-apps/api/event"`; subscribe in `App.vue` / `player.ts` init.
* [ ] **`.catch(() => {})` at IPC boundary** (`App.vue:69`, `stores/player.ts:320, 321, 484, 541, 572`): route through `useNotify().run(...)`.
* [ ] **`console.error` in visualizer only** (`visualizer/storm.ts:221`, `vortex.ts:137`): replace with `useNotifyStore().error(...)`.
* [ ] **`ensureGraph` partial-fail leaves stale state** (`webDriver.ts:67-114`): null all graph state in catch.
* [ ] **`pendingEq` lost on graph build** (`webDriver.ts:38`): re-apply after `ensureGraph()`.
* [ ] **`pick_scan_paths` errors reach user as raw `String(err)`** (`api/tauri.ts:33`): map common Tauri error shapes to friendly text.
* [ ] **No `tauri-plugin-log`, no panic hook** (`coreamp-app/Cargo.toml:15-23` + `main.rs:1882-2043`): add `tauri-plugin-log = "2"`, `std::panic::set_hook` writes panic to `config_dir()` log.
* [ ] **No crash reporting SDK / no offline crash dump**: decision point (offline dump vs opt-in Sentry); add `config_dir()/crashes/` regardless.
* [ ] **No `errorCaptured` / `ErrorBoundary`**: wrap each tab pane.
* [ ] **No "Open logs folder" / "Report a bug" UI** (`SettingsView.vue:1-340`): add `Settings → Help` section.
* [ ] **No "Export diagnostic bundle" feature**: add `export_diagnostics` Tauri command zipping `config_dir()/*` + log tail.
* [ ] **Daemon logs to `/tmp` on macOS, world-readable** (`deploy/launchd/com.coreamp.daemon.plist:24-25` + `coreamp-daemon/src/main.rs:17-159`): redirect to `~/Library/Logs/CoreAmp/daemon.err.log` with rotation.
* [ ] **No `tracing` in `coreamp-daemon`**: add `tracing` + `tracing-subscriber` + `tracing-appender` with daily rotation.
* [ ] **No audit log for settings / scan / metadata / playlist changes**: extend `DaemonEvent` or write `audit.log.jsonl`.
* [ ] **Daemon IPC drops malformed events silently** (`coreamp-common/src/ipc.rs:129`): log parse error with line number.
* [ ] **Audio decode failure surfaces only as toast, no recovery** (`stores/player.ts:577-578`): add "Skip" action or auto-advance.
* [ ] **Library scan has no progress UI / cancel** (`SettingsView.vue:188-194, 249-256`): stream via Tauri events + progress bar.
* [ ] **Notification text shows raw backend strings incl. SQL paths** (`composables/useNotify.ts:18-20`): redact `/Users/[^/]+/` and SQL "no such column".
* [x] **Toast doesn't dedupe identical messages** (`stores/notify.ts:39-43`): cap 5 simultaneous; dedupe by `kind+text` in 2s window.

## 0.5 Performance
* [ ] **VibeTabs panes not lazy** (`App.vue:16-27`): `KeyboardHeroGame` (1623 lines, WebGL), `ThreeOrb`, `AudioMotionViz`, `SettingsView` mount on boot. Add `lazy` prop.
* [ ] **`progressTimer` fires even when paused** (`App.vue:98-100`): pause + resume on `watch(isPlaying)` + `document.visibilitychange`.
* [ ] **`NotificationHost` `deep: true` watcher** (`NotificationHost.vue:79`): watch `() => notify.notes.map(n => n.id)` without `deep: true`.
* [ ] **`useFrequencyData` runs RAF even with zero consumers + paused** (`useFrequencyData.ts:31-45`): skip `fillIdle` when no consumer wants frames; use `requestIdleCallback`.
* [ ] **10 `VibeSlider` `input` handlers + 60Hz RAF all on main thread** (`AudioView.vue:81-101`): coalesce slider writes with RAF; write on `change` not `input`.
* [ ] **`TrackTable` not virtualized** (`TrackTable.vue:6-16`): verify `VibeDataTable` paginates server-side; else add `vue-virtual-scroller`.
* [ ] **`QueueList` not virtualized** (`QueueList.vue:38-93`): use `@vueuse/core` `useVirtualList` or `vue-virtual-scroller`.
* [ ] **Hard-coded `height: 600px` on `.top-region`** (`App.vue:146`): use `min-height: 600px; max-height: 80vh;` + 3rd breakpoint.
* [ ] **`data-bs-theme` not pre-paint** (`index.html:2-7`): inline pre-mount script reading localStorage.
* [ ] **`AlbumArt` urlCache + inflight Maps never evict** (`AlbumArt.vue:31-32`): LRU cap (500) or hold raw `TrackArtwork` + lazy data URL.
* [ ] **ChickenLander canvas scaling bottleneck** (`ChickenLanderGame.vue:439-445`): size to `container.clientWidth × clientHeight` with DPR clamp.
* [ ] **`Visualizer` WebGL context leak on plugin switch** (`Visualizer.vue:4-17`): ensure `destroy()` in `onBeforeUnmount`; consistent `:key`.
* [ ] **3 separate `WebGLRenderer` instances live concurrently** (`vortex.ts:16-21`, `storm.ts:45-49`, `ThreeOrb.vue:95-100`): share one renderer/scene, swap meshes.
* [ ] **`EqGraph` redraws full canvas at 60fps** (`EqGraph.vue:71-72`): throttle to 30fps; scale canvas to DPR.
* [ ] **`read()` + `aggregateBars` re-allocates per frame** (`EqGraph.vue:36, 57`): cache `bars` + `curve` typed arrays as `shallowRef`.
* [ ] **`webDriver` module-level state never disposed** (`webDriver.ts:19-114`): wire `import.meta.hot?.dispose(() => ctx?.close())`.
* [ ] **`HomeView` + `LikedView` reload on every `ui.dataVersion` bump** (`HomeView.vue:79-80`, `LikedView.vue:42-43`): debounce or `flush: 'post'`.
* [ ] **380KB three.js vendor not code-split** (`vite.config.ts`): dynamic import inside `loadThree` or `manualChunks` + `<link rel="preload">`.
* [ ] **iOS Safari throttles audio elements outside DOM** (`webDriver.ts:40-48`): append `<audio>` to hidden host div under body.
* [ ] **`preloadNext` gapless under shuffle is dead code** (`stores/player.ts:501-506`): preloaded deck never matches shuffled "next".
* [ ] **`startCrossfade` setTimeout not cancellable** (`webDriver.ts:174-206`): track timers in `crossfadeTimers[]`; clear in `webDriver.destroy()`.
* [ ] **`read_track_artwork` ships base64 over IPC** (`main.rs:1064`): 32MB art → 43MB JSON. Write resized JPEG to asset-protocol scope, return `convertFileSrc` URL.
* [ ] **Sync commands do file I/O on the IPC thread** (`main.rs:685, 852, 1041, 1176, 1217, 1308, 1121, 992`): wrap each in `tauri::async_runtime::spawn_blocking`.
* [ ] **`pick_scan_paths` blocks IPC on `osascript`** (`main.rs:967-989`): wrap in `spawn_blocking`.
* [ ] **`set_track_artwork` reads whole 32MB image into memory** (`main.rs:698`): cap at 8MB or stream-validate magic bytes.
* [ ] **`load_playlist` re-opens every file not in DB** (`main.rs:1121-1128`): pre-filter or return lightweight `TrackPath { path, exists }`.
* [ ] **2-second polling loop for daemon events** (`main.rs:1899-1914`): use `notify` crate / FSEvents.
* [ ] **Audio buffer underrun / position drift not measured** (`App.vue:93-100` + `webDriver.ts:240-250`): add `error`/`stalled`/`waiting` listeners; compute `driftMs` per poll.
* [ ] **Web Audio `AudioContext` state changes not logged** (`webDriver.ts:66-114`): `ctx.onstatechange` handler.
* [ ] **ReplayGain flips mid-fade cause a pop** (`stores/player.ts:538-540`): ramp `replayGainNode` over fade window.

## 0.6 Testing Infrastructure
* [ ] **No `tests/` dir in any Rust crate** (`coreamp-app`, `coreamp-common`, `coreamp-daemon`): 48 `#[tauri::command]` handlers have zero integration tests. Create `coreamp-app/tests/commands.rs`.
* [ ] **No `tauri::test::mock_app()` / `MockRuntime` used** (`Cargo.toml:22`): add `[dev-dependencies] tauri = { features = ["test"] }`.
* [ ] **DSP chain has zero unit tests** (`main.rs:2046-2128`): `BiquadState::process`, `peaking_coefficients`, `low_shelf_coefficients`, `soft_limit`, `NativeDspRuntime::from_settings`, `has_processing`, `NativeDspSource::next` all uncovered.
* [ ] **`coreamp-daemon` has zero `#[test]`** (`coreamp-daemon/src/main.rs:1-160`): extract `parse_args_from(args: &[String])`; add `tests/scan.rs` with `tempfile::tempdir()`.
* [ ] **`tests/playback/` missing entirely**: `webDriver.ts` (active audio engine on web) has zero tests. Add `tests/audio/webDriver.spec.ts`.
* [ ] **No AudioContext mock**: write `tests/audio/fakeAudioContext.ts` recording `createGain`/`createBiquad`/`createAnalyser`/`connect`.
* [ ] **No Tauri event mocking**: add `tests/util/tauriMock.ts` with hoisted `vi.mock("@tauri-apps/api/event", …)`.
* [ ] **No `tests/util/factories.ts`**: `mkQueue` is local to `player.spec.ts:64-68` with `as never`. Centralize `mkTrack`/`mkLibraryTrack`/`mkPlaylist`.
* [ ] **No test audio fixtures**: commit 5-track `tests/fixtures/audio/` set (lofty-licensed or generated).
* [ ] **No SQLite `:memory:` helper**: 12 of 13 `db.rs` tests duplicate `Connection::open_in_memory()`. Add `with_in_memory_db` closure.
* [ ] **No `tempfile` crate use**: hand-rolled `make_temp_dir` races on parallel test runs.
* [ ] **No coverage tool installed or configured** (`vite.config.ts:15-19`): add `@vitest/coverage-v8` + `cargo-llvm-cov`; thresholds 70% lines.
* [ ] **No E2E framework installed**: zero `tauri-driver`, `@playwright/test`. Add `tauri-driver` in macOS CI.
* [ ] **No visual regression**: Chromatic, Percy, Histoire all absent. Add `vitest-image-snapshot`.
* [ ] **No `tests/README.md`**: write covering `npm test`, single test, debug, fixtures, mocks.
* [ ] **IPC payload types duplicated, not shared** (`main.rs:42-56` vs `types.ts:24-38`): single source via `ts-rs`/`specta` or shared JSON schema.
* [ ] **No IPC payload schema versioning**: add `v: 1` envelope on every TS wrapper; reject mismatched in Rust.
* [ ] **ReplayGain track/album modes untested end-to-end**: wire `setReplayGainMode("album")` → track change → expected `webDriver.setReplayGain(trackGain+albumGain)`.
* [ ] **Drag-and-drop import never bound in test** (`PlaylistsView.vue:131`): mock `getCurrentWebview().onDragDropEvent`.
* [ ] **macOS tray menu actions have no test** (`main.rs:1945-1961`): with `tauri::test::mock_app()`, emit each menu event and assert handler.
* [ ] **Daemon IPC has no E2E** (`ipc.rs:99-141`): 2-thread test asserting monotonic IDs + parse-ok.
* [ ] **No 10k-track library load test**: seed 10k rows, assert `loadTracks` pagination + queue persist.
* [ ] **vi.useFakeTimers used twice only** (`player.spec.ts:1046`, `NotificationHost.spec.ts:12`): extend to webDriver preload, queueStorage, App.vue poll.
* [ ] **Real-time deps in tests** (`SleepTimer.spec.ts:32`, `player.spec.ts:258`): `Date.now()` + 250ms IPC poll not faked.
* [ ] **`tests/api/tauri.spec.ts` 38 lines, 2 of ~40 wrappers**: parametrize over `WRAPPERS` table.
* [ ] **`smoke.spec.ts` is vacuous `1+1=2`** (L4-6): delete or replace with `App.vue` render assertion.
* [ ] **`tests/setup.ts:9` `config.global.plugins = []` clobbers previous**: use `.filter()` instead.

## 0.7 Accessibility
* [ ] **3 hand-rolled modals missing focus trap + restoration** (`AddToPlaylistModal.vue`, `EditMetadataModal.vue`, `TrackDetailsModal.vue`): replace with `<VibeModal v-model>`. ~120 LOC removed.
* [ ] **VibeTabs `aria-selected` / arrow-key nav not verified** (`App.vue:16-27`): confirm VibeUI sets `role="tablist"` + `aria-selected`; if not, wrap.
* [ ] **Hand-rolled `role="button"` `<li>` not keyboard-activatable** (`AddToPlaylistModal.vue:40-49`, `PlaylistsView.vue:33-44`, `TrackDetailsModal.vue:52-64`): add `tabindex="0"` + `@keydown.enter/space.prevent`.
* [ ] **`EditMetadataModal` form labels not associated with inputs** (`EditMetadataModal.vue:10-39`): use `<VibeFormGroup label="Title">`.
* [ ] **`aria-live="polite"` toast host missing `aria-atomic`/`aria-relevant`** (`NotificationHost.vue:2`): add `aria-relevant="additions"`, drop redundant inner `role="status"`.
* [ ] **`Visualizer.vue` fullscreen container not announced as dialog** (`Visualizer.vue:44-53`): add `role="dialog"` + `aria-label`.
* [ ] **`prefers-reduced-motion` only handled in `KeyboardHeroGame.vue:1442-1444`**: add global guard that pauses RAF / `fillIdle`.

## 0.8 Code Quality (Foundational)
* [ ] **5 duplicated `loadOr` helpers in `player.ts`** (`stores/player.ts:23-88`): extract `usePersistedRef<T>(key, default, schema)`. Add volume, muted, shuffle, repeatMode, stopAfterCurrent, outputDevice.
* [ ] **`@ts-nocheck` on `storm.ts` and `vortex.ts`**: drop; type the state objects.
* [ ] **`ThreeOrb.vue` `let state: any = null` + dead `prevTreble`** (`ThreeOrb.vue:23, 209`): type `state` with interface; drop `prevTreble`.
* [ ] **`useAudioStore` state not persisted** (`stores/audio.ts:43-64`): persist eqEnabled, bands, preset, boostLevel, preampDb, limiterEnabled, crossfeedEnabled under `coreamp.audio.v1`.
* [ ] **`ui.activeTab` not persisted** (`stores/ui.ts:12-37`): persist `coreamp.ui.activeTab`.
* [ ] **Library view/filters not persisted** (`stores/library.ts:17-48`): view, search, genreFilter, likedOnly.
* [ ] **`vibe-color-mode` key not namespaced** (`vibeui.es.js:8575, 8593`): wrap with `coreamp.` prefix in `App.vue`.
* [ ] **`prefers-color-scheme` MediaQueryList never detached** (`vibeui.es.js:8598-8628`): HMR / unmount leak listeners.
* [ ] **No cross-tab color mode sync**: `window.addEventListener("storage", …)` re-apply.
* [ ] **`listLibrary` cast drops typecheck** (`api/tauri.ts:73`): type the `invoke` signature strictly.
* [ ] **PRESETS constant duplicated** (`stores/audio.ts` + `AudioView.vue:169`): single source.
* [ ] **Raw Bootstrap buttons where VibeButton exists** (`QueueList.vue:56-62`, `Visualizer.vue:29-37`, `NotificationHost.vue:4-9, 23-32`): migrate to `VibeButton` / `VibeCloseButton`.
* [ ] **`HomeView.vue` / `LikedView.vue` / `SettingsView.vue` dead `defineExpose`** (`HomeView.vue:69, 123`, `LikedView.vue:42-43`, `SettingsView.vue:195`): remove or document.
* [ ] **`AudioView.vue` ReplayGainMode coerced via `String(value)`** (`AudioView.vue:137-145`): use `Set.has` type guard.
* [ ] **`EditMetadataModal` does not prompt on switch-with-unsaved** (`EditMetadataModal.vue:73-81, 84`): discard prompt or reset on close.
* [ ] **`TrackDetailsModal` non-null cast in computed** (`TrackDetailsModal.vue:95`): split into `<TrackDetailsModal v-if="…">` so non-null is provable.
* [ ] **`LibraryTrack.title || filename` fallback duplicated 4×** (`TrackTable.vue:21`, `NowPlaying.vue:51`, `TrackDetailsModal.vue:13`, `util/track.ts:8`): add `trackDisplayTitle(t)`.
* [ ] **`LibraryTrack` shoved into `Track[]` via `toQueueTrack` in 4 places** (`util/track.ts:5-13`): drop `Track` interface, use `LibraryTrack[]`.
* [ ] **`AudioView.vue:191` preset dropdown reverts to "Flat" after `applyUserPreset`**: track selection independent of `audio.preset`.
* [ ] **Game keydown handlers don't check active form field focus** (`ChickenLanderGame.vue:176`, `KeyboardHeroGame.vue:1364`): guard with `document.activeElement` form-field check.
* [ ] **`useShortcuts` checks fragile `data-test="visualizer"`** (`useShortcuts.ts:53-62`): use `useUiStore().interactiveVisualizer` flag.
* [ ] **`useShortcuts` no debounce on key-repeat** (`useShortcuts.ts:9`): leading-edge debounce ~50ms.
* [ ] **`useShortcuts` doesn't `preventDefault` on Arrow keys when no current track** (`useShortcuts.ts:14-18`).
* [ ] **No `passive: true` on `keydown` listeners** (`App.vue:97`, `Visualizer.vue:99-100`).
* [ ] **No ESLint / Prettier configs** (`coreamp-app/frontend/`): add `eslint` + `eslint-plugin-vue` + `prettier`; add `lint` script.
* [ ] **`tsconfig.json:11` lacks `vite/client` types**: add.
* [ ] **Untyped `lastSignature` / `metaToken` in stores**: type explicitly.
* [ ] **`library.toggleLike` filter behavior inconsistent with `LikedView`** (`stores/library.ts:151-156`): unify or document.
* [ ] **`library.ts` `loadArtists` / `loadAlbums` / `loadGenreSummaries` / `loadGenreOptions` / `loadCount` have no error handling** (`stores/library.ts:106-119`): try/catch + notify.
* [ ] **`playlists.ts importFile` no try/catch** (`stores/playlists.ts:62-65`): wrap and toast on single failure.
* [ ] **`sleepHandle` / `crossfadeHandle` module-level in `player.ts`** (`stores/player.ts:128, 132`): move into store state, clear in teardown.
* [ ] **`useUpdater` `pending` not persisted** (`composables/useUpdater.ts:17-73`): persist `pending.version` to `coreamp.updater.pending`.
* [ ] **`useUpdater.ts` only reads `contentLength` / `chunkLength`** (`useUpdater.ts:54-63`): handle `total` / `progress`.
* [ ] **`setSleepTimer(0)` doesn't call `cancelSleepTimer`** (`stores/player.ts:434-450`): call before the guard.
* [ ] **`setSleepTimer` doesn't fully validate `Number.isFinite`** (`stores/player.ts:430-443`): reject non-number.
* [ ] **`setCrossfade` has no upper bound** (`stores/player.ts:517-521`): clamp to e.g. 12s.
* [ ] **`is_placeholder_title` nukes user titles that match filename** (`main.rs:898-915`): only clear when title is file_stem default.
* [ ] **`combine_asset_roots` dedup is by string, not canonical** (`coreamp-common/src/library.rs:223-229`): `canonicalize` before dedup.
* [ ] **`infer_bit_depth` returns None for FLAC** (`main.rs:1300-1305`): prefer lofty's value.
* [ ] **`parse_wav_bit_depth` only reads 512 bytes** (`main.rs:1283-1291`): read up to 64 KiB or stream.
* [ ] **`read_track_artwork` forces JPEG mime even when no resize** (`main.rs:1040-1067`): preserve mime.
* [ ] **Library dedup is by path+mtime+size, not content** (`coreamp-common/src/library.rs:189-198`): add content hash for "Dedup Library" P1.
* [ ] **Device switch loses position** (`main.rs:1594-1619`): capture `get_pos()` before teardown, re-seek after.
* [ ] **`jumpTo` rebuilds shuffle from a stale seed** (`stores/player.ts:414-422`): re-evaluate shuffle position.
* [ ] **`bump is_placement_title` / `native_audio_status` consumes `finished` on every read** (`main.rs:1812`): emit a one-shot `native://track-finished` event instead.
* [ ] **`init()` overwrites prior native selection with web** (`stores/player.ts:184-195`): read persisted preference.
* [ ] **`setSource` runs playback against wrong driver after `init()` hard-pins web** (`stores/player.ts:202-211, 184-195`).
* [ ] **`peekHops` / `soft_limit` panic on `sample_rate = 0`** (`main.rs:382, 403`): upstream `NativeDspSource::new` doesn't clamp.
* [ ] **`soft_limit` doesn't clamp to [-1, 1]** (`main.rs:355-363`): output can exceed 1.0 slightly above threshold.
* [ ] **`setSource` (Rust) is not transactional** (`main.rs:1582-1644`): teardown runs before new stream opens; if new device fails, playback is gone.
* [ ] **Native engine self-disables on first Play error** (`main.rs:1480-1492`): keep `available = true`; only set `active = false` + error detail.
* [ ] **`playCurrent` error path stalls the queue silently** (`stores/player.ts:577-579`): no auto-skip, no retry.
* [ ] **`Last track played `track.ts: LibraryTrack title || filename` fallback**: see 0.8 dedup.

---

# P1 - Core Player Parity

Features users expect from a modern desktop music player.

## Themes & Accessibility
* [ ] Complete Apple-dark visual polish pass.
* [ ] Visualizer Full Frame with Mini-Player Controls.
* [ ] Visualizer locked at 6x9 aspect.
* [ ] Add button to toggle theme mode (night, day, system); setting should be remember between sessions.
* [ ] Track queue should be remember between sessions.
* [ ] Mobile and small-window layout support.
* [ ] Native backend gapless support.
* [ ] Gapless playback toggle.
* [ ] Gapless validation testing.

## Library Browsing
* [ ] Album artist editing.
* [ ] Track number editing.
* [ ] Dedup Library Functionality in Settings Tab area.

## Playlists
* [ ] Save search as playlist.
* [ ] Add queue to selected playlist.
* [ ] Smart Liked playlist.
* [ ] Track details sidebar.
* [ ] Album details panel.
* [ ] Year display.
* [ ] Tracklist display.

## Audio
* [ ] Verify boost processing parity (native vs web).
* [ ] Verify limiter processing parity.
* [ ] Verify crossfeed processing parity.
* [ ] Web path implements missing boost bass+warmth biquads (parity gap).
* [ ] Web path implements missing limiter + crossfeed (parity gap).
* [ ] Web path implements missing ReplayGain multiplier (parity gap).
* [ ] ReplayGain track mode.
* [ ] ReplayGain album mode.
* [ ] Crossfade engine.
* [ ] Crossfade controls.
* [ ] Crossfade tuning.
* [ ] Sleep timer.

## Integration
* [ ] Add update checking UI.
* [ ] Add update installation UI.
* [ ] Add system now-playing integration.
* [ ] Auto-update on launch + periodic 24h check.
* [ ] "Skip this version" / "remind me later" for updates.
* [ ] `applyOnQuit` defer option for updates.
* [ ] Multi-endpoint updater fallback (GH + self-hosted JSON).
* [ ] No `darwin-x86_64` reuse of aarch64 updater artifact in `latest.json`.

---

# P2 - Power User Features

## Import Experience
* [ ] Choose files picker.
* [ ] Explicit path entry.
* [ ] File and folder drop zone.
* [ ] Complete MusicBrainz integration.
* [ ] Complete Cover Art Archive integration.
* [ ] Cache metadata lookups locally.
* [ ] Avoid repeated lookups for previously failed matches.
* [ ] Show a status in the updater UI when importing (with a spinner).
* [ ] Download missing album artwork from Cover Art Archive.
* [ ] Cache downloaded artwork locally.
* [ ] Refresh artwork on demand.
* [ ] Allow manual artwork replacement.

## Code Quality (P2)
* [ ] Remove duplicated indexing logic.
* [ ] Consolidate metadata helpers.
* [ ] Improve structured error handling.
* [ ] Expand automated test coverage.
* [ ] Global busy/loading state.
* [ ] Dynamic tray labels.
* [ ] Better error reporting.

---

# P4 - Ship Blockers

## Networking

## DSP Performance

N/A under the current web-only output (native rodio DSP path is bypassed; web EQ uses Web Audio `AudioParam`). Revisit if native output is re-enabled.

---

# P5 - Visualizers

## ThreeJS Visualizers

Review the current implementations that already exist. They will all need to be converted into their own component for easy management. In addition to porting over the Storm, Orb, Vortex, review other projects for ideas:

* https://maximevermeeren.medium.com/threejs-objects-reacting-on-audio-1adca87ec71a
* https://speckyboy.com/audio-visualization-code-snippets/
* https://freefrontend.com/javascript-audio-visualizer/
* https://codepen.io/prakhar625/pen/zddKRj
* https://github.com/jhugheswebdev/sound-equalizer-threejs

* [ ] Orb
* [ ] Vortex
* [ ] Storm

## Games TBD

Do not start. Each will have a breakdown.

* [ ] Remove existing games entirely.

Chicken Lander - See PRD.
Keyboard Hero - See PRD.

---

# Deferred / Lower Priority (nits)

* [ ] `NowPlaying.vue` "Unknown artist" hardcoded English (`NowPlaying.vue:48-58`).
* [ ] `SleepTimer.vue` flickers "0" after timer fires (`SleepTimer.vue:38-39, 43`).
* [ ] `TrackTable.vue:131` `void props;` redundant.
* [ ] `queueStorage.ts` JSON.stringify on whole queue per change is O(N) (`queueStorage.ts:23`).
* [ ] `queueStorage.ts` `persistQueueIfChanged` is idempotency, not debounce (`queueStorage.ts:31-35`).
* [ ] `Visualizer.vue:73-88` `pluginId` typed as generic; use 5-string union + type guard.
* [ ] `AudioMotionViz.vue:3-11` raw `<select>` instead of `VibeFormSelect`.
* [ ] `Visualizer.vue:3-18` three.js state is module-level singleton; rapid plugin switches race cleanup.
* [ ] `ChickenLanderGame.spec.ts` / `KeyboardHeroGame.spec.ts` only test mount/unmount (1623 + 484 lines untested).
* [ ] `tests/stores/player.spec.ts:64-68` `mkQueue` uses `as never` cast.
* [ ] `notify.ts:22` `nextId` unbounded.
* [ ] No coverage report upload to artifact store.
* [ ] `format_enrichment_failure` test pins the PII leak (`library.rs:280-285`).
* [ ] Daemon stderr has no timestamp prefix (`coreamp-daemon/src/main.rs:17-159`).
* [ ] `lastSignature` is module-level in `queueStorage.ts` (HMR / second store reuses prior signature).
* [ ] `persistQueue` swallows quota errors silently.
* [ ] `restoreQueue` doesn't validate files still exist (`stores/player.ts:185-189`).
* [ ] `restoreQueue` title fallback uses raw path (`stores/player.ts:577`).
* [ ] `peekHops` `next_event_id` non-atomic event id (covered in 0.2).
* [ ] `m3u` parser/serializer has no BOM/CRLF/encoding test.
* [ ] `write_missing_tags` `None` fields are no-ops — unverified.
* [ ] `run_native_audio_thread` has no tests (volume clamp, seek math, version bump).
* [ ] `extract_year` only accepts `YYYY-MM-DD`; `YYYY-MM` fails.
* [ ] `prune_missing_files` calls `Path::new(path).exists()` without canonicalization (symlink to missing target is deleted).
* [ ] `error.rs` `From` chain integrity unverified.
* [ ] `image_bytes_match_mime` magic-byte table untested (JPEG2000 collision).
* [ ] `list_all_genres` filter bypassed by empty strings.
* [ ] `set_rating` / `toggle_liked` public API never tested (lock-poison path).
* [ ] `lookup_recording` happy path untested (no `wiremock`).
* [ ] `publish_daemon_event` open+writeln is not atomic.
* [ ] `trim_events_file` is non-atomic; no tmp+rename.
* [ ] `settings::load_settings` has no corruption recovery (covered in 0.3).
* [ ] `NativeDspRuntime::from_settings` boost-level fallback unverified.
* [ ] `normalize_metadata_input` trims empty to None — no test.
* [ ] `save_settings` rejects 0 but `load_settings` doesn't (hand-edited JSON with 0 → hot loop).
* [ ] `is_placeholder_title` logic untested.
* [ ] `nativeAudioSetDspSettings` is dead on the TS side.
* [ ] `call<T>` flattens any thrown value to `String(err)`.
* [ ] `ListLibraryArgs` has no bounds checking.
* [ ] `native_audio_play` blocks on `mpsc::Receiver::recv`.
* [ ] `native_audio_selected_output_device` silently returns `None` on lock failure.
* [ ] `read_replay_gain` and `read_track_artwork` don't return `Result`.
* [ ] Remove unused `objc2` / `image` (in `coreamp-common`) / `dompurify` / `urlencoding` deps.
* [ ] `ASSET_PROTOCOL.scope` already configured at runtime; remove the placeholder.
* [ ] Refactor `db::upsert_scanned_files` "preserve when not empty" pattern to avoid clobbering.
* [ ] `library_track_from_row` placeholder title clear; test the cleared condition.
