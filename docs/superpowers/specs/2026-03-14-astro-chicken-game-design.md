# Astro Chicken: Music-Powered Endless Runner

## Overview

An 8-bit endless runner that renders in CoreAmp's visualizer canvas area as a new reactive visualizer mode (sub-mode 4: "Game"). A cybernetic chicken with an arm cannon runs, jumps, ducks, and shoots through a procedurally generated alien landscape driven by the currently playing music.

## Integration

- Lives as reactive sub-mode index 4 alongside Orb (0), Vortex (1), Nebula (2), Storm (3)
- Follows existing pattern: `initGameVisualizer()`, `destroyGameVisualizer()`, `tickGameVisualizer(bass, mid, treble, time)`
- Game state stored in `reactiveState` with `mode: "game"`
- Game loop driven by existing `tickCurrentReactiveMode` — no separate rAF
- `REACTIVE_SUB_MODE_COUNT` bumped from 4 to 5

## Controls

| Input | Action |
|-------|--------|
| Up arrow | Jump (tap = short hop, hold = higher) |
| Down arrow | Duck/slide under obstacles |
| Space bar | Shoot arm cannon |

Keyboard input via `keydown`/`keyup` listeners stored in a key state map. Listeners added on init, removed on destroy.

## Rendering

- **Canvas**: 2D context (`getContext("2d")`), not WebGL
- **Internal resolution**: 320x180 pixels
- **Scaling**: nearest-neighbor upscale to fill visualizer container (`imageSmoothingEnabled = false`)
- **All sprites procedural**: pixel arrays defined in code, no external image assets

## Sprites (all procedural pixel art)

- **Chicken**: ~12x14px, frames: run1, run2, jump, duck, shoot. Cybernetic look — metal legs, helmet, arm cannon
- **Enemy**: ~8x8px alien blob, single type for v1, 2-frame idle animation
- **Projectile**: 3px horizontal blaster bolt, bright color
- **Explosion**: 4-frame pixel burst for enemy death and player death

## Music Reactivity

| Audio Band | Game Effect |
|------------|-------------|
| Bass energy | Scroll speed (heavier bass = faster) |
| Bass velocity spikes | Screen shake, terrain height shifts |
| Treble spikes | Enemy spawns (harder treble = denser enemies) |
| Mid energy | Obstacle density (gaps in ground, overhead barriers) |
| Overall energy | Background color palette shift |

## Gameplay

- Auto-scrolling side-runner. Chicken moves right automatically.
- **Terrain**: ground line undulates with bass. Gaps appear based on mid energy.
- **Enemies**: spawn from the right edge. Walk left toward the player. Killed by blaster shots (1 hit). Contact with chicken = death.
- **Obstacles**: overhead barriers requiring duck. Ground gaps requiring jump.
- **Score**: distance survived + enemies killed. Displayed top-right in chunky 8-bit font.
- **Death**: chicken flashes, pixel explosion, "GAME OVER" text with final score. Any key restarts.
- **Song ends**: game over screen with score.

## Visual Layers (back to front)

1. **Stars** (far parallax) — slow scroll, tiny dots
2. **Mountains** (mid parallax) — medium scroll, simple silhouette polygons
3. **Ground** (near) — fast scroll, terrain line that shifts with bass
4. **Entities** — chicken, enemies, projectiles, explosions
5. **HUD** — score counter, top-right

## Architecture

```
tickGameVisualizer(bass, mid, treble, time)
  ├── updateInput()          — read key state map
  ├── updatePlayer()         — physics, jump/duck/shoot
  ├── updateTerrain()        — scroll, generate new segments from audio
  ├── updateEnemies()        — spawn from treble, move, collision
  ├── updateProjectiles()    — move, hit detection
  ├── updateEffects()        — explosions, screen shake
  ├── renderBackground()     — stars, mountains parallax
  ├── renderTerrain()        — ground line
  ├── renderEntities()       — chicken, enemies, projectiles
  ├── renderEffects()        — explosions, flashes
  └── renderHUD()            — score, game over
```

All state lives in `reactiveState` — no globals beyond what the existing visualizer system uses.

## Scope Boundary (v1)

**In scope**: one enemy type, jump/duck/shoot, music-reactive terrain and spawning, score, game over, restart.

**Out of scope for v1**: power-ups, bosses, multiple weapon types, persistent high scores, difficulty levels, sound effects.

## Success Criteria

- Game is fun to play for the duration of a song
- Music reactivity is clearly felt (not just cosmetic)
- Pixel art reads clearly at the scaled resolution
- No performance impact on audio playback
- Clean init/destroy lifecycle — no leaked listeners or state
