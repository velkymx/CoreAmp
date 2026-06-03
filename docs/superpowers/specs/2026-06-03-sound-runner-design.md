# Astro Chicken: "Sound Runner" — Design

Date: 2026-06-03
Status: Approved (pending spec review)

## Summary

Replace the current Astro Chicken endless-runner visualizer with a Mario-style
side-scrolling platformer **whose terrain is generated from the playing mp3's
audio shape**. Space-Invader enemies attack; the sky and clouds react to the
live music; death shows a global top-5 high-score table.

It remains a visualizer mode (`game`) in the player card, selectable from the
visualizer mode dropdown alongside Bars / Spectrum / Oscilloscope / Orb.

## Goals

- The **level is the song**: decode the current track once and derive the
  terrain from its loudness/bass envelope. Same song → same level.
- **Free movement**: the player runs/jumps at their own pace through the
  song-shaped terrain. The track plays as backdrop; world position is NOT locked
  to the playhead.
- **Mario-ish platforming**: left/right run, jump with gravity, solid ground +
  floating platforms, pits.
- **Space-Invader enemies**: formations that march sideways, descend, and drop
  bombs; killed by stomping (landing on them) or shooting.
- **Music-reactive sky/clouds**: background color + clouds react to the live
  analyser (bass/mid/treble), independent of the static terrain.
- **Global high scores**: top 5 persisted in `localStorage`, shown on death.
- **Always playable**: if no track is loaded or decode fails, fall back to a
  random-seeded level.

## Non-Goals (YAGNI)

- No metroidvania map / ability gates / backtracking.
- No meta-progression, saves beyond the high-score table, or backend.
- No initials entry on the score table (store numeric score + song name + date).
- No locked-to-playback traversal (explicitly rejected in favor of free
  movement).
- Not promoted out of the visualizer panel (stays in the player card).

## Architecture

Small, independently testable units:

### `src/visualizer/decodeTrack.ts`
- `decodeTrack(assetUrl: string): Promise<AudioBuffer>` — `fetch(assetUrl)` →
  `arrayBuffer()` → `new AudioContext().decodeAudioData(...)`. Uses a throwaway
  context (or the shared one) purely for decoding.
- `extractEnvelope(channel: Float32Array, sampleRate: number, sliceMs = 40):
  EnvelopeSlice[]` — **pure**. Walks the channel in `sliceMs` windows producing
  `{ rms, bass }` per slice. `rms` = sqrt(mean(sample^2)) over the window.
  `bass` = rms of a low-passed copy (cheap single-pole IIR low-pass before
  squaring) so loud-bass slices read high. Normalize both to 0..1 across the
  track (divide by track max, guard against 0).
- `EnvelopeSlice = { rms: number; bass: number }`.
- Only `extractEnvelope` is unit-tested (pure, operates on a `Float32Array`).
  The decode wrapper is integration-only (Web Audio unavailable in jsdom).

### `src/visualizer/soundLevel.ts`
- `buildLevel(envelope: EnvelopeSlice[], opts?): LevelData` — **pure,
  deterministic**.
- Mapping:
  - Each envelope slice → one terrain **column** (fixed pixel width, e.g. 24px).
  - `ground height` = `minGround + rms * heightRange` (loud = higher ground /
    hills, quiet = low ground). Below a quiet threshold (`rms < pitThreshold`)
    the column is a **pit** (no ground → fall = death).
  - `bass` spikes above `bassPlatformThreshold` → a **floating platform** a few
    tiles above the ground at that column, and a candidate **enemy spawn point**
    (formation anchored there).
  - Spawn density throttled (min spacing between formations) so loud sections
    don't wall you in.
- `LevelData = { columns: Column[]; spawns: Spawn[]; widthPx: number }`
  - `Column = { groundY: number | null /* null = pit */; platformY: number | null }`
  - `Spawn = { x: number; rows: number; cols: number }`
- Unit-tested: louder slice → higher `groundY`; very quiet slice → pit; bass
  spike → platform + spawn; spawn spacing respected; deterministic across calls.

### `src/visualizer/highScores.ts`
- `loadScores(): Score[]` / `insertScore(s: Score): Score[]` — **pure over
  `localStorage`** (key `coreamp.soundrunner.scores`).
- `Score = { score: number; song: string; date: string /* ISO */ }`.
- `insertScore` appends, sorts desc by `score`, caps at 5, persists, returns the
  new top 5. Corrupt/missing storage → treated as empty.
- Unit-tested with a `localStorage` stub: capped at 5, sorted desc, survives
  corrupt JSON.

### `src/visualizer/soundRunner.ts` (`@ts-nocheck`)
- The canvas game engine. `createSoundRunner(container, level, getBands,
  onGameOver) → { destroy() }`.
  - Owns: a fixed-resolution canvas (e.g. 320×180, CSS-scaled, pixelated),
    its own `requestAnimationFrame` loop, and keyboard listeners
    (←/→/↑/Space/X), added on create and removed on destroy.
  - **Player physics**: horizontal accel/friction, gravity, jump impulse,
    AABB collision vs `Column.groundY` and platforms; falling below the screen
    in a pit = death.
  - **Camera**: scrolls to follow the player (free movement). At
    `level.widthPx` the world **loops back to the start** (seamless repeat) so a
    short song still gives an endless run; `distance` is capped at one full pass
    (`widthPx`) while `kills` keep scoring on subsequent loops.
  - **Enemies**: Space-Invader formations spawned from `level.spawns` as the
    camera approaches; march left/right + step down, periodically drop bombs;
    die to a stomp (player descending onto them) or a player bullet.
  - **Scoring**: `distance` (max world-x reached / column) + `kills * K`.
  - **Sky/clouds**: drawn first each frame using `getBands()` (live) — sky
    gradient hue/brightness from bass+mid, cloud drift speed + scale + opacity
    from the beat. This is the only live-audio coupling; terrain is static.
  - **Death**: stop input, call `onGameOver(score, distance, kills)`, freeze the
    frame (overlay handled by the Vue component).
- Engine internals are not unit-tested (canvas/RAF); the testable logic lives in
  the pure modules above.

### `src/components/SoundRunner.vue` (replaces `AstroChicken.vue`)
- On mount:
  1. Read current track path from the player store (`currentTrack?.path`).
  2. If present → `convertFileSrc(path)` → `decodeTrack` → `extractEnvelope` →
     `buildLevel`. Show a "Generating level from <song>…" loader during decode.
  3. If absent or decode throws → `buildLevel` of a random-seeded synthetic
     envelope + a "no song loaded — random level" note.
  4. `createSoundRunner(host, level, () => extractBands(freq.value), onGameOver)`
     using the shared `useFrequencyData()` composable for the live sky/clouds.
- `onGameOver` → `insertScore({score, song, date})` → render a **game-over
  overlay** listing the top 5 + the run's score, with "Press R to play again"
  (rebuilds the level from the same track and restarts).
- On unmount: `engine.destroy()`.
- The visualizer dropdown keeps the `game` option labeled "Astro Chicken".

## Data Flow

```
mode = game
  → SoundRunner.vue mount
  → player.currentTrack.path → convertFileSrc → decodeTrack → extractEnvelope
  → buildLevel(envelope) → LevelData
  → createSoundRunner(host, level, () => extractBands(freq), onGameOver)
      loop: draw sky/clouds from live bands → update/draw terrain+player+enemies
  → death → onGameOver(score) → insertScore → overlay top 5
  → R → rebuild + restart
```

## Error Handling

- Decode failure / no track → random-seeded level + visible note (never a blank
  screen or crash).
- `localStorage` unavailable or corrupt → scores treated as empty; `insertScore`
  no-ops persistence but still returns the in-memory top 5.
- WebGL not involved (2D canvas), so no GL-capability gating needed.
- Keyboard listeners are always removed on destroy to avoid leaking arrow/space
  capture into the rest of the app.

## Testing

Unit tests (vitest), all on pure modules:
- `extractEnvelope`: window slicing + RMS math on a known `Float32Array`
  (silence → 0; full-scale tone → ~high; normalization to 0..1).
- `buildLevel`: loud→higher ground, quiet→pit, bass spike→platform+spawn, spawn
  spacing respected, deterministic.
- `highScores`: insert sorts desc + caps at 5 + survives corrupt JSON (stubbed
  `localStorage`).

Manual/integration: decode a real mp3 in the app, confirm the terrain tracks the
song's loudness, sky/clouds react live, death shows the top 5, R restarts.

## Migration

- `AstroChicken.vue` and `visualizer/astroChicken.ts` are removed/replaced by
  `SoundRunner.vue` + the new modules. The visualizer `game` mode now mounts
  `SoundRunner`. Its tests (if any) are replaced by the new pure-module tests.
