# "Cast & Catch" — Fishing Game Design

Date: 2026-06-03
Status: Approved (pending spec review)

## Summary

A cozy music-driven fishing mini-game, added as a visualizer mode (`fishing`)
in the CoreAmp player card. Cast a line, a fish bites on a beat, then reel it in
with a Stardew-style hold-to-reel tension bar whose fish darts to the music.
Caught fish score by rarity; three strikes end the run and show a global top-5
high-score table.

Unlike Sound Runner, this game needs **no offline mp3 decode** — all music
reactivity comes from the live analyser via the shared `useFrequencyData`
composable + `extractBands`.

## Goals

- **Cast → bite → reel** loop. Cast with Space; a fish bites on a live bass
  onset; reel it in with a hold-to-reel tension bar.
- **Hold-to-reel** (Stardew-style): hold Space to raise a catch-zone (gravity
  drops it when released); keep it overlapping the darting fish to fill a catch
  meter. Full = landed; empty = line snaps.
- **Music-driven**: water + sky react to live bands; bites fire on bass onsets;
  the fish darts (speed/amplitude) with live mid/treble + beats.
- **Rarity & scoring**: rarity tier rolled at bite from current intensity
  (bigger bass = rarer/faster/more points). Score = sum of rarity-weighted
  catches.
- **Run + strikes + scores**: 3 strikes (line snap or a let-through bite) end
  the run → global top-5 overlay → R restarts.
- **Always playable**: with no track / paused, the analyser feeds idle data, so
  fishing still works (bites just come slower).

## Non-Goals (YAGNI)

- No offline track decode / level generation (Sound Runner does that; this does
  not).
- No inventory, fish collection book, currency, or upgrades.
- No multiple ponds / biomes.
- No on-beat tap reeling (explicitly rejected in favor of hold-to-reel; that
  flavor belongs to the queued rhythm game).
- Not promoted out of the visualizer panel.

## Architecture

Same shape as Sound Runner: small pure tested units + an `@ts-nocheck` canvas
engine + a Vue wrapper.

### `src/visualizer/fishingModel.ts` (pure, unit-tested)
The game math, with no canvas/DOM:

- Constants `FISHING` (catch bar geometry, fill/drain rates, gravity, reel
  thresholds, rarity tiers).
- `updateReel(meter, overlap, dt): number` — when `overlap` is true the meter
  rises by `FILL * dt`, else drops by `DRAIN * dt`; clamped to `[0, 1]`.
- `reelOutcome(meter): "reeling" | "landed" | "snapped"` — `>= 1` landed,
  `<= 0` snapped, else still reeling.
- `rollRarity(intensity: number, rng: () => number): RarityTier` — maps a 0..1
  intensity (live bass/energy at bite) to a tier, with higher intensity biasing
  toward rarer tiers. `RarityTier = { name: string; points: number; speed:
  number; size: number }` (e.g. Common/Silver/Gold/Legendary).
- `RARITY_TIERS: RarityTier[]` — ordered common→legendary.
- Pure and deterministic given the injected `rng`.

### `src/visualizer/highScores.ts` (extend, unit-tested)
Generalize to a namespaced key so each game has its own board:

- `loadScores(gameId = "soundrunner"): Score[]`
- `insertScore(entry: Score, gameId = "soundrunner"): Score[]`
- Storage key becomes `coreamp.<gameId>.scores`. Defaults preserve Sound
  Runner's existing key/behavior; Sound Runner call sites are updated to pass
  `"soundrunner"` explicitly for clarity (no behavior change). Fishing passes
  `"fishing"`.
- Tests: fishing and soundrunner boards are independent; defaults unchanged.

### `src/visualizer/fishing.ts` (`@ts-nocheck`, canvas engine)
`createFishing(container, getBands, onGameOver) -> { destroy() }`.

- Owns a fixed-resolution canvas (320×180, pixelated), its own RAF loop, and a
  Space keydown/up listener (added on create, removed on destroy).
- **State machine**: `idle` → (Space) `casting` → `waiting` → (bass onset)
  `biting` → (Space within window, else strike) `reeling` → `landed` | `snapped`
  → back to `idle`; `over` after 3 strikes.
  - **Bite detection**: a bass onset = current bass exceeds a short rolling
    average by a threshold while in `waiting`.
  - **Bite window**: a brief flash; pressing Space enters `reeling`; letting it
    pass = a strike.
  - **Reeling**: fish target Y darts using `getBands()` (mid/treble/beat) +
    the rolled tier `speed`; the catch-zone Y integrates hold/gravity; overlap →
    `updateReel`; `reelOutcome` decides land/snap. Land → add `tier.points` to
    score; snap or missed bite → +1 strike.
- **Render**: reactive sky gradient + water (hue/brightness from live bands),
  ripples, the angler/line, the reel bar with catch-zone + fish + catch meter
  during `reeling`, and a HUD (score + strike pips).
- Engine internals are not unit-tested (canvas/RAF); testable logic lives in
  `fishingModel`.

### `src/components/Fishing.vue`
- Mounts `createFishing(host, () => extractBands(freq.value), onGameOver)` using
  the shared `useFrequencyData()` composable.
- `onGameOver(score)` → `insertScore({score, song, date}, "fishing")` → render a
  game-over overlay with the top-5 + "Press R to play again" (R recreates the
  engine).
- `song` name comes from the player store's current track (or "Untitled").
- On unmount: `engine.destroy()`.
- Add a `fishing` option ("Fishing") to the `Visualizer.vue` mode dropdown and
  render `<Fishing v-else-if="pluginId === 'fishing'" />`.

## Data Flow

```
mode = fishing
  → Fishing.vue mount
  → createFishing(host, () => extractBands(freq), onGameOver)
      loop: read live bands → drive sky/water + bites + fish darting
      cast → bite (bass onset) → reel (hold-to-reel, updateReel/reelOutcome)
      land → score += tier.points ; snap/miss → strike++
      3 strikes → onGameOver(score)
  → insertScore(.., "fishing") → overlay top-5
  → R → recreate engine
```

## Error Handling

- No track / paused → idle analyser data still drives the game (slower bites);
  never blank or crashes.
- `localStorage` unavailable/corrupt → handled by the existing `highScores`
  guards; `insertScore` returns the in-memory top 5.
- Space key listener always removed on destroy (no leaked key capture).
- No decode/network path, so no decode failure handling needed.

## Testing

Unit tests (vitest), pure modules only:
- `fishingModel`:
  - `updateReel`: overlap raises, gap lowers, clamps to [0,1].
  - `reelOutcome`: ≥1 landed, ≤0 snapped, otherwise reeling.
  - `rollRarity`: low intensity → common-biased, high intensity → rarer-biased
    (using a deterministic rng); always returns a valid tier; tier points
    increase common→legendary.
- `highScores` (keyed): fishing and soundrunner boards are independent; default
  key preserves prior behavior.

Manual/integration: play an mp3, open Fishing mode — confirm water/sky react,
fish bite on beats, hold-to-reel lands/snaps, rarity scales with intensity,
3 strikes shows the top-5, R restarts.

## Migration / Touch Points

- `highScores.ts` gains an optional `gameId` param; update the two Sound Runner
  call sites in `SoundRunner.vue` to pass `"soundrunner"` (no behavior change)
  and its spec/tests note the default.
- New files: `fishingModel.ts`, `fishing.ts`, `Fishing.vue` + their tests.
- `Visualizer.vue`: one new mode entry + one conditional render branch.
