# CoreAmp Vue UI — Parity TODO

Goal: bring the new Vue 3 + VibeUI frontend to feature parity with the legacy
`dist/index.html`, then cut over. Backend (~39 Tauri commands) is unchanged and
is the contract. Each milestone gets its own implementation plan (writing-plans)
and is built TDD-first with vitest + Vue Test Utils.

Spec: `docs/superpowers/specs/2026-06-02-vibeui-migration-design.md`
Plans: `docs/superpowers/plans/`

Legend: `[x]` done · `[ ]` todo · `(cmd)` backing Tauri command(s)

---

## Milestone 1 — Foundation (DONE)
- [x] Vite + Vue 3 + TS + Pinia + VibeUI scaffold; build to `dist` (gitignored)
- [x] Vendored visualizer libs relocated to `frontend/public/vendor`
- [x] Typed Tauri API boundary `api/tauri.ts` (`TauriError`, native-audio subset)
- [x] Web playback driver adapter
- [x] Player store: re-entrancy-safe `togglePlayback` (fixes H-A/H-B), tested
- [x] `TransportControls.vue` play/pause with reactive icon (`VibeIcon icon=`)
- [x] App shell: 6 `VibeTabs` + transport footer
- [x] Tauri build hooks + CSP drops `unsafe-eval` (S2)
- [x] Smoke: renders in webview via dev server

---

## Milestone 2 — Player parity + Visualizer
Transport / now-playing / output controls.
- [x] Prev / Next wired to queue navigation in the player store (cmd: native_audio_play/stop)
- [x] Progress bar: scrub + time display, two-way with playback position (`VibeSlider`)
- [x] Volume control: speaker icon + slider, mute (cmd: native_audio_set_volume)
- [x] Shuffle toggle (queue shuffle without interrupting current track)
- [x] Repeat cycle: off / queue / track
- [x] Like button on the player (cmd: toggle_liked) + Liked sync
- [x] Boost cycle control: Off / Boost+ / Boost++ (in Audio tab via audio store cycleBoost)
- [ ] Gapless toggle + true seamless transition (BACKEND GAP: no gapless command exists in coreamp-app; needs native preload/queue support before a UI toggle is meaningful)
- [x] Signal details: format / sample rate / bit depth / channels / bitrate (cmd: read_track_signal_details)
- [x] Native vs web output toggle; fallback handling surfaced — player.setSource restarts current track on the chosen path; visualizer offers a "switch to Web output" shortcut
- [x] Output device selection (cmd: list_native_output_devices, native_audio_set_output_device, native_audio_selected_output_device)
- [x] Now-playing artwork + title/artist (cmd: read_track_artwork)
- [x] `Visualizer.vue` — RESOLVED: plugin host (the VibeHero) with swappable plugins (Bars / Spectrum / Oscilloscope), canvas + RAF, idle animation when no live audio
- [x] Web Audio graph + `<audio>` lifecycle owned in one place — AudioContext→MediaElementSource→Analyser graph lives in webDriver; getAnalyser() feeds the visualizer

## Milestone 3 — Library + Liked
- [x] Library list with album-art thumbnails (cmd: list_library, library_count) — placeholder art icon for now; real per-row artwork deferred (perf: read_track_artwork per row)
- [x] Segmented control: Tracks / Artists / Albums / Genres (`VibeButtonGroup`/`VibeTabs`)
- [x] Tracks table sortable + searchable — search + click-to-sort columns (title/album/duration, asc/desc, nulls-last) done; pagination still pending
- [x] Summary grids: Artists / Albums / Genres cards (cmd: list_artists, list_albums, list_genres, list_genre_summaries)
- [x] Search box + genre filter
- [ ] Unknown-title handling shows under "U"
- [x] Row context menu (`VibeDropdown`): Play next / Add to queue / Add to playlist / Edit metadata — all done
- [x] Inline Like on rows (cmd: toggle_liked)
- [x] Clickable metadata (album/artist/genre) → filtered view — summary cards + in-row artist/album clicks both filter the Library
- [x] Liked view reuses the track table
- [x] Record play on playback (cmd: record_play)

## Milestone 4 — Playlists + Queue
- [x] Playlist browser list (cmd: list_playlists)
- [x] Load playlist into queue (cmd: load_playlist)
- [x] Save / create playlist from queue or search (cmd: save_playlist)
- [x] Delete playlist (cmd: delete_playlist)
- [x] Append tracks to playlist (cmd: append_to_playlist) — row "Add to playlist…" modal (append to existing or create new)
- [x] Import `.m3u` by drag-and-drop (cmd: import_playlist_file) — Tauri file-drop listener imports .m3u/.m3u8, with a drop-zone hint
- [x] De-dup playlist + cleanup button (cmd: dedup_playlist)
- [x] Queue panel: reorder via drag (`VibeSortable`) — reorder via up/down buttons + remove; true drag (VibeSortable) pending
- [x] Queue actions: Play next / Queue next / Play from here / Stop after current / Clear played

## Milestone 5 — Audio / EQ + EqGraph
- [x] Parametric EQ: multi-band frequency / gain / Q sliders (`VibeSlider`)
- [x] EQ presets (Flat / Warm / Presence / V Curve / Bass Cut) + reset (`VibeFormSelect`)
- [ ] Persist named user EQ presets — no backend command for custom presets; deferred
- [x] EQ bypass toggle
- [x] `EqGraph.vue` — RESOLVED: custom SVG curve from RBJ peaking-biquad magnitude response (util/eq.ts)
- [x] DSP chain controls: preamp / limiter / crossfeed / bass boost (cmd: native_audio_set_dsp_settings)
- [ ] Apply EQ/DSP to native + web paths — native done; web-path EQ graph not wired yet

## Milestone 6 — Home + Settings
- [x] Dashboard: Top Artists + Recently Played artwork cards (cmd: list_top_artists, list_recently_played)
- [x] Settings: scan interval + API proxy (cmd: get_settings, save_settings)
- [x] Scan library / scan paths + folder picker (cmd: scan_library, scan_paths, pick_scan_paths)
- [x] Import (merged into Settings) — folder scan covers import
- [x] App version display (cmd: app_version)
- [ ] Updater: check / install update
- [ ] Edit metadata modal (cmd: update_track_metadata_for_path); write missing tags (cmd: write_missing_tags_for_path)
- [x] Clear history (cmd: clear_history)
- [x] Status toasts for all async ops — custom NotificationHost + notify store; playback/DSP/library/playlists/settings/output errors all surfaced

## Milestone 7 — Cutover
- [ ] Visual parity pass: Apple-dark theme overrides on Bootstrap base
- [ ] Tray controls (`tray://control`) + daemon events (`daemon://event`) wired to stores
- [ ] Full smoke pass: play a `~/Music` track, exercise every tab
- [ ] Delete legacy `dist/index.html` from history note / confirm `dist` is pure build output
- [ ] Merge `epic/vibeui-migration` → release branch

---

## Carry-over feature gaps (were open in the legacy TODO.md)
These were unchecked in the old UI; decide keep/defer during each milestone:
- [ ] Track info sidebar: album art, year, tracklist, lyrics (Milestone 2/3)
- [ ] Album-centric browsing grouped by album order (Milestone 3)
- [ ] Expand metadata: album artist / track no. / disc no. / composer / genre (Milestone 3/6)
- [ ] Folder/album art coverage when embedded art missing (Milestone 2/3)
- [ ] Search sort by Genre (Milestone 3)
- [ ] Range slider gradient bug — N/A once on `VibeSlider` (verify in Milestone 2/5)
- [ ] Mobile layout constraints (Milestone 7 polish)
- [ ] ReplayGain track/album gain (post-parity)
- [ ] Crossfade after gapless (post-parity)
- [ ] Clipping / peak meter (post-parity)
