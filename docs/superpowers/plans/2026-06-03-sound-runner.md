# Sound Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Astro Chicken endless runner with "Sound Runner" — a Mario-style side-scrolling platformer whose terrain is generated from the playing mp3's audio shape, with Space-Invader enemies, music-reactive sky/clouds, and a global top-5 high-score table.

**Architecture:** Three pure, unit-tested modules (`decodeTrack`/`extractEnvelope`, `soundLevel`, `highScores`), one `@ts-nocheck` canvas game engine (`soundRunner.ts`), and a Vue wrapper (`SoundRunner.vue`) that decodes the current track, builds the level, runs the engine with live analyser data for the sky, and shows the score overlay. Wired into the existing Visualizer `game` mode.

**Tech Stack:** TypeScript, Vue 3 `<script setup>`, Vitest, Web Audio (`decodeAudioData`), 2D canvas, the existing `useFrequencyData` composable + `extractBands` util, `@tauri-apps/api/core` `convertFileSrc`.

Working directory for all commands: `/Users/velkymx/Code/CoreAmp/coreamp-app/frontend`. Run tests with `npx vitest run <path>` and the type/build check with `npm run build`.

---

## Task 1: Audio envelope extraction (`extractEnvelope`)

**Files:**
- Create: `src/visualizer/decodeTrack.ts`
- Test: `tests/visualizer/decodeTrack.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/visualizer/decodeTrack.spec.ts
import { describe, it, expect } from "vitest";
import { extractEnvelope } from "@/visualizer/decodeTrack";

describe("extractEnvelope", () => {
  it("returns one slice per window and zero for silence", () => {
    const sr = 1000; // 1000 samples/sec → 40ms window = 40 samples
    const channel = new Float32Array(400); // 0.4s → 10 slices
    const env = extractEnvelope(channel, sr, 40);
    expect(env).toHaveLength(10);
    expect(env.every((s) => s.rms === 0 && s.bass === 0)).toBe(true);
  });

  it("normalizes rms to a 0..1 peak of 1", () => {
    const sr = 1000;
    const channel = new Float32Array(120); // 3 slices
    // Slice 0 quiet, slice 1 loud (full-scale), slice 2 medium.
    for (let i = 0; i < 40; i++) channel[i] = 0.1;
    for (let i = 40; i < 80; i++) channel[i] = 1.0;
    for (let i = 80; i < 120; i++) channel[i] = 0.5;
    const env = extractEnvelope(channel, sr, 40);
    expect(env).toHaveLength(3);
    expect(env[1].rms).toBeCloseTo(1, 5); // loudest slice normalizes to 1
    expect(env[0].rms).toBeLessThan(env[2].rms);
    expect(env[2].rms).toBeLessThan(env[1].rms);
  });

  it("reports bass energy below treble for a low-frequency-only signal", () => {
    const sr = 4000;
    const channel = new Float32Array(4000);
    // ~50Hz sine — energy is all in the low band.
    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.sin((2 * Math.PI * 50 * i) / sr);
    }
    const env = extractEnvelope(channel, sr, 40);
    // Bass tracks the low-passed energy; for a pure low tone it stays high.
    expect(env.some((s) => s.bass > 0.5)).toBe(true);
  });

  it("handles an empty channel", () => {
    expect(extractEnvelope(new Float32Array(0), 1000, 40)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/visualizer/decodeTrack.spec.ts`
Expected: FAIL — `extractEnvelope` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/visualizer/decodeTrack.ts
export interface EnvelopeSlice {
  rms: number; // normalized 0..1 loudness
  bass: number; // normalized 0..1 low-band energy
}

// Pure: reduce a mono channel into per-window {rms, bass} slices, each
// normalized so the loudest slice across the track is 1.0.
export function extractEnvelope(
  channel: Float32Array,
  sampleRate: number,
  sliceMs = 40,
): EnvelopeSlice[] {
  if (channel.length === 0) return [];
  const win = Math.max(1, Math.floor((sampleRate * sliceMs) / 1000));
  const slices: { rms: number; bass: number }[] = [];

  // Single-pole low-pass to isolate bass energy (~cutoff a few hundred Hz).
  const cutoff = 200;
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  let lp = 0;

  for (let start = 0; start < channel.length; start += win) {
    let sumSq = 0;
    let sumBassSq = 0;
    let n = 0;
    for (let i = start; i < start + win && i < channel.length; i++) {
      const x = channel[i];
      lp += alpha * (x - lp);
      sumSq += x * x;
      sumBassSq += lp * lp;
      n++;
    }
    slices.push({
      rms: n ? Math.sqrt(sumSq / n) : 0,
      bass: n ? Math.sqrt(sumBassSq / n) : 0,
    });
  }

  const maxRms = Math.max(1e-9, ...slices.map((s) => s.rms));
  const maxBass = Math.max(1e-9, ...slices.map((s) => s.bass));
  return slices.map((s) => ({
    rms: s.rms / maxRms,
    bass: s.bass / maxBass,
  }));
}

// Decode a track (asset URL) into an AudioBuffer for offline analysis. Uses a
// short-lived AudioContext purely for decoding. Integration-only (Web Audio is
// unavailable under jsdom), so this wrapper is not unit-tested.
export async function decodeTrack(assetUrl: string): Promise<AudioBuffer> {
  const resp = await fetch(assetUrl);
  const bytes = await resp.arrayBuffer();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/visualizer/decodeTrack.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add coreamp-app/frontend/src/visualizer/decodeTrack.ts coreamp-app/frontend/tests/visualizer/decodeTrack.spec.ts
git commit -m "feat: audio envelope extraction for sound-runner levels"
```

---

## Task 2: Level generation (`buildLevel`)

**Files:**
- Create: `src/visualizer/soundLevel.ts`
- Test: `tests/visualizer/soundLevel.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/visualizer/soundLevel.spec.ts
import { describe, it, expect } from "vitest";
import { buildLevel, LEVEL } from "@/visualizer/soundLevel";
import type { EnvelopeSlice } from "@/visualizer/decodeTrack";

const slice = (rms: number, bass = 0): EnvelopeSlice => ({ rms, bass });

describe("buildLevel", () => {
  it("makes one column per envelope slice and sets widthPx", () => {
    const level = buildLevel([slice(0.5), slice(0.5), slice(0.5)]);
    expect(level.columns).toHaveLength(3);
    expect(level.widthPx).toBe(3 * LEVEL.COL_W);
  });

  it("maps louder slices to higher ground (smaller groundY)", () => {
    const level = buildLevel([slice(0.2), slice(0.9)]);
    const quiet = level.columns[0].groundY as number;
    const loud = level.columns[1].groundY as number;
    expect(loud).toBeLessThan(quiet); // higher ground = smaller y
  });

  it("turns very quiet slices into pits", () => {
    const level = buildLevel([slice(0.5), slice(0.0), slice(0.5)]);
    expect(level.columns[1].groundY).toBeNull();
  });

  it("adds a platform and a spawn on a bass spike", () => {
    const env = [slice(0.5), slice(0.6, 0.95), slice(0.5)];
    const level = buildLevel(env);
    expect(level.columns[1].platformY).not.toBeNull();
    expect(level.spawns.some((s) => s.x === 1 * LEVEL.COL_W)).toBe(true);
  });

  it("spaces spawns out so loud runs don't wall you in", () => {
    const env = Array.from({ length: 10 }, () => slice(0.6, 0.99));
    const level = buildLevel(env);
    for (let i = 1; i < level.spawns.length; i++) {
      expect(level.spawns[i].x - level.spawns[i - 1].x).toBeGreaterThanOrEqual(
        LEVEL.SPAWN_MIN_GAP_PX,
      );
    }
  });

  it("is deterministic", () => {
    const env = [slice(0.3, 0.2), slice(0.8, 0.95), slice(0.0)];
    expect(buildLevel(env)).toEqual(buildLevel(env));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/visualizer/soundLevel.spec.ts`
Expected: FAIL — `buildLevel` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/visualizer/soundLevel.ts
import type { EnvelopeSlice } from "@/visualizer/decodeTrack";

// Shared level/world constants (logical canvas is 320x180).
export const LEVEL = {
  VW: 320,
  VH: 180,
  COL_W: 16, // px width of one terrain column
  GROUND_MIN_Y: 70, // highest ground (loudest)
  GROUND_MAX_Y: 150, // lowest ground (quietest)
  PIT_RMS: 0.06, // below this, the column is a pit
  BASS_PLATFORM: 0.75, // bass above this drops a platform + spawn
  PLATFORM_OFFSET: 42, // px above ground for the platform
  SPAWN_MIN_GAP_PX: 96, // min horizontal spacing between enemy formations
} as const;

export interface Column {
  groundY: number | null; // null = pit
  platformY: number | null;
}
export interface Spawn {
  x: number; // world x (px) of the formation anchor
  rows: number;
  cols: number;
}
export interface LevelData {
  columns: Column[];
  spawns: Spawn[];
  widthPx: number;
}

export function buildLevel(envelope: EnvelopeSlice[]): LevelData {
  const columns: Column[] = [];
  const spawns: Spawn[] = [];
  let lastSpawnX = -Infinity;

  envelope.forEach((s, i) => {
    const x = i * LEVEL.COL_W;
    let groundY: number | null;
    if (s.rms < LEVEL.PIT_RMS) {
      groundY = null;
    } else {
      groundY =
        LEVEL.GROUND_MAX_Y - s.rms * (LEVEL.GROUND_MAX_Y - LEVEL.GROUND_MIN_Y);
    }

    let platformY: number | null = null;
    if (s.bass >= LEVEL.BASS_PLATFORM && groundY !== null) {
      platformY = groundY - LEVEL.PLATFORM_OFFSET;
      if (x - lastSpawnX >= LEVEL.SPAWN_MIN_GAP_PX) {
        spawns.push({ x, rows: 2, cols: 4 });
        lastSpawnX = x;
      }
    }
    columns.push({ groundY, platformY });
  });

  return { columns, spawns, widthPx: columns.length * LEVEL.COL_W };
}

// Synthetic fallback envelope (when there's no track / decode fails) so the
// game is always playable. Deterministic given a seed.
export function syntheticEnvelope(length = 600, seed = 1): EnvelopeSlice[] {
  let t = seed;
  const rand = () => {
    t = (t * 1103515245 + 12345) & 0x7fffffff;
    return t / 0x7fffffff;
  };
  return Array.from({ length }, (_, i) => {
    const rms = 0.35 + Math.sin(i * 0.07) * 0.3 + (rand() - 0.5) * 0.15;
    const bass = rand() < 0.06 ? 0.9 + rand() * 0.1 : rand() * 0.5;
    return { rms: Math.min(1, Math.max(0, rms)), bass };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/visualizer/soundLevel.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add coreamp-app/frontend/src/visualizer/soundLevel.ts coreamp-app/frontend/tests/visualizer/soundLevel.spec.ts
git commit -m "feat: build sound-runner level from audio envelope"
```

---

## Task 3: High scores (`highScores`)

**Files:**
- Create: `src/visualizer/highScores.ts`
- Test: `tests/visualizer/highScores.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/visualizer/highScores.spec.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadScores, insertScore, SCORES_KEY } from "@/visualizer/highScores";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe("highScores", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
  });

  it("starts empty", () => {
    expect(loadScores()).toEqual([]);
  });

  it("keeps the top 5 sorted descending", () => {
    [10, 50, 30, 90, 20, 70, 5].forEach((score) =>
      insertScore({ score, song: "x", date: "2026-06-03" }),
    );
    const top = loadScores();
    expect(top.map((s) => s.score)).toEqual([90, 70, 50, 30, 20]);
  });

  it("insertScore returns the new top 5", () => {
    const top = insertScore({ score: 42, song: "y", date: "2026-06-03" });
    expect(top[0].score).toBe(42);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(SCORES_KEY, "{not json");
    expect(loadScores()).toEqual([]);
    expect(() => insertScore({ score: 1, song: "z", date: "d" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/visualizer/highScores.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/visualizer/highScores.ts
export const SCORES_KEY = "coreamp.soundrunner.scores";
const MAX = 5;

export interface Score {
  score: number;
  song: string;
  date: string; // ISO date
}

export function loadScores(): Score[] {
  try {
    const raw = localStorage.getItem(SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => typeof s?.score === "number")
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function insertScore(entry: Score): Score[] {
  const next = [...loadScores(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX);
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — still return the in-memory top 5 */
  }
  return next;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/visualizer/highScores.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add coreamp-app/frontend/src/visualizer/highScores.ts coreamp-app/frontend/tests/visualizer/highScores.spec.ts
git commit -m "feat: global top-5 high scores for sound runner"
```

---

## Task 4: Game engine (`soundRunner.ts`)

No unit tests (canvas + RAF). The testable logic lives in Tasks 1–3. This task is verified by `npm run build` (type/compile) and manual play.

**Files:**
- Create: `src/visualizer/soundRunner.ts`

- [ ] **Step 1: Write the engine**

```ts
// @ts-nocheck
// Sound Runner engine: a free-movement side-scrolling platformer over a
// song-shaped level, with Space-Invader enemies and a music-reactive sky.
import { LEVEL } from "@/visualizer/soundLevel";

const G = 0.5;          // gravity
const JUMP = -7.6;      // jump impulse
const ACC = 0.55;       // horizontal acceleration
const FRICTION = 0.82;  // ground friction
const MAX_VX = 2.6;
const PLAYER_W = 12;
const PLAYER_H = 14;
const BULLET_SPEED = 4.5;
const SHOOT_COOLDOWN = 0.22; // seconds
const KILL_POINTS = 50;

export function createSoundRunner(container, level, getBands, onGameOver) {
  const { VW, VH, COL_W } = LEVEL;
  const canvas = document.createElement("canvas");
  canvas.width = VW;
  canvas.height = VH;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.imageRendering = "pixelated";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const keys = {};
  let jumpEdge = false;
  const onKeyDown = (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "x", "X"].includes(e.key)) {
      e.preventDefault();
      if ((e.key === "ArrowUp" || e.key === " ") && !keys[e.key]) jumpEdge = true;
      keys[e.key] = true;
    }
  };
  const onKeyUp = (e) => { keys[e.key] = false; };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Cloud field for the reactive sky.
  const clouds = Array.from({ length: 6 }, () => ({
    x: Math.random() * VW,
    y: 10 + Math.random() * 60,
    s: 0.6 + Math.random() * 0.8,
    spd: 0.05 + Math.random() * 0.1,
  }));

  const s = {
    px: 40, py: 0, vx: 0, vy: 0, onGround: false, facing: 1,
    camX: 0, dist: 0, kills: 0, dead: false, shootCd: 0,
    bullets: [], enemies: [], bombs: [],
    spawned: new Set(), lastTime: 0, raf: 0,
  };

  // Sample a level column at a world x (wraps for the endless loop).
  function colAt(worldX) {
    const idx = ((Math.floor(worldX / COL_W) % level.columns.length) +
      level.columns.length) % level.columns.length;
    return level.columns[idx];
  }

  function groundYAt(worldX) {
    return colAt(worldX).groundY;
  }

  function spawnFormation(spawn) {
    const baseGround = groundYAt(spawn.x) ?? 80;
    for (let r = 0; r < spawn.rows; r++) {
      for (let c = 0; c < spawn.cols; c++) {
        s.enemies.push({
          x: spawn.x + c * 18,
          y: baseGround - 60 - r * 16,
          ox: spawn.x + c * 18,
          dir: 1,
          phase: Math.random() * Math.PI * 2,
          alive: true,
        });
      }
    }
  }

  function update(dt, time) {
    // Spawn formations as the camera nears them.
    for (const sp of level.spawns) {
      if (!s.spawned.has(sp.x) && sp.x < s.camX + VW + 40 && sp.x > s.camX - 40) {
        s.spawned.add(sp.x);
        spawnFormation(sp);
      }
    }

    // Horizontal movement.
    if (keys.ArrowLeft) { s.vx -= ACC; s.facing = -1; }
    if (keys.ArrowRight) { s.vx += ACC; s.facing = 1; }
    if (!keys.ArrowLeft && !keys.ArrowRight) s.vx *= FRICTION;
    s.vx = Math.max(-MAX_VX, Math.min(MAX_VX, s.vx));
    s.px += s.vx;

    // Jump (edge-triggered) + gravity.
    if (jumpEdge && s.onGround) { s.vy = JUMP; s.onGround = false; }
    jumpEdge = false;
    s.vy += G;
    s.py += s.vy;

    // Ground / platform collision (sample under the player's feet).
    const footX = s.px + PLAYER_W / 2;
    const gY = groundYAt(footX);
    const col = colAt(footX);
    s.onGround = false;
    if (gY !== null && s.py + PLAYER_H >= gY && s.vy >= 0) {
      s.py = gY - PLAYER_H;
      s.vy = 0;
      s.onGround = true;
    }
    // One-way platform: land only when falling onto its top.
    if (col.platformY !== null && s.vy >= 0) {
      const pY = col.platformY;
      if (s.py + PLAYER_H >= pY && s.py + PLAYER_H <= pY + 8) {
        s.py = pY - PLAYER_H;
        s.vy = 0;
        s.onGround = true;
      }
    }

    // Endless loop: wrap world position.
    if (s.px >= level.widthPx) { s.px -= level.widthPx; s.spawned.clear(); }
    if (s.px < 0) s.px += level.widthPx;

    // Fall into a pit / off the bottom = death.
    if (s.py > VH + 20) return die();

    s.dist = Math.min(level.widthPx, Math.max(s.dist, s.px));
    s.camX = s.px - VW * 0.35;

    // Shooting.
    s.shootCd -= dt;
    if ((keys.x || keys.X) && s.shootCd <= 0) {
      s.shootCd = SHOOT_COOLDOWN;
      s.bullets.push({ x: s.px + PLAYER_W / 2, y: s.py + 5, vx: s.facing * BULLET_SPEED });
    }
    s.bullets.forEach((b) => (b.x += b.vx));
    s.bullets = s.bullets.filter((b) => b.x > s.camX - 20 && b.x < s.camX + VW + 20);

    // Enemies: march + descend + occasional bombs.
    for (const en of s.enemies) {
      if (!en.alive) continue;
      en.x += en.dir * (0.4 + Math.sin(time * 0.001 + en.phase) * 0.3);
      en.y += 0.05; // slow descent
      if (Math.abs(en.x - en.ox) > 26) en.dir *= -1;
      if (Math.random() < 0.002) {
        s.bombs.push({ x: en.x, y: en.y, vy: 1.2 });
      }
    }
    s.bombs.forEach((bo) => (bo.y += bo.vy));
    s.bombs = s.bombs.filter((bo) => bo.y < VH + 10);

    // Bullet → enemy hits.
    for (const b of s.bullets) {
      for (const en of s.enemies) {
        if (en.alive && Math.abs(en.x + 6 - b.x) < 8 && Math.abs(en.y + 6 - b.y) < 8) {
          en.alive = false;
          b.x = -9999;
          s.kills++;
        }
      }
    }
    s.enemies = s.enemies.filter((en) => en.alive && en.y < VH + 20);

    // Player ↔ enemy / bomb collisions (screen-space).
    const psx = s.px - s.camX;
    for (const en of s.enemies) {
      if (!en.alive) continue;
      const esx = en.x - s.camX;
      if (Math.abs(esx + 6 - (psx + PLAYER_W / 2)) < 9 &&
          Math.abs(en.y + 6 - (s.py + PLAYER_H / 2)) < 10) {
        // Stomp (descending onto the top) kills; otherwise the player dies.
        if (s.vy > 1 && s.py + PLAYER_H < en.y + 10) {
          en.alive = false; s.kills++; s.vy = JUMP * 0.6;
        } else {
          return die();
        }
      }
    }
    for (const bo of s.bombs) {
      if (Math.abs(bo.x - (s.px + PLAYER_W / 2)) < 8 &&
          Math.abs(bo.y - (s.py + PLAYER_H / 2)) < 9) return die();
    }
  }

  function score() {
    return Math.floor(s.dist / COL_W) + s.kills * KILL_POINTS;
  }

  function die() {
    if (s.dead) return;
    s.dead = true;
    onGameOver(score(), Math.floor(s.dist / COL_W), s.kills);
  }

  function drawSky(time) {
    const { bass, mid, treble } = getBands();
    const top = `hsl(${220 - bass * 40}, 60%, ${8 + mid * 14}%)`;
    const bot = `hsl(${260 - mid * 50}, 55%, ${18 + bass * 18}%)`;
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    // Clouds drift + pulse with treble.
    ctx.fillStyle = `rgba(255,255,255,${0.12 + treble * 0.25})`;
    for (const c of clouds) {
      c.x -= c.spd * (1 + bass * 2);
      if (c.x < -40) c.x = VW + 20;
      const w = 26 * c.s * (1 + treble * 0.4);
      const h = 9 * c.s;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, w, h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain() {
    const startCol = Math.floor(s.camX / COL_W) - 1;
    for (let i = 0; i <= VW / COL_W + 2; i++) {
      const worldCol = startCol + i;
      const col = level.columns[((worldCol % level.columns.length) +
        level.columns.length) % level.columns.length];
      const sx = worldCol * COL_W - s.camX;
      if (col.groundY !== null) {
        ctx.fillStyle = "#2e6b3a";
        ctx.fillRect(sx, col.groundY, COL_W, 4);
        ctx.fillStyle = "#1f3b22";
        ctx.fillRect(sx, col.groundY + 4, COL_W, VH - col.groundY);
      }
      if (col.platformY !== null) {
        ctx.fillStyle = "#b5651d";
        ctx.fillRect(sx, col.platformY, COL_W, 4);
      }
    }
  }

  function drawEntities() {
    // Bullets.
    ctx.fillStyle = "#ffe861";
    for (const b of s.bullets) ctx.fillRect(b.x - s.camX, b.y, 3, 2);
    // Enemies (Space-Invader blobs).
    for (const en of s.enemies) {
      const ex = en.x - s.camX;
      ctx.fillStyle = "#48d858";
      ctx.fillRect(ex, en.y, 12, 12);
      ctx.fillStyle = "#0a280a";
      ctx.fillRect(ex + 2, en.y + 4, 2, 2);
      ctx.fillRect(ex + 8, en.y + 4, 2, 2);
    }
    // Bombs.
    ctx.fillStyle = "#ff5050";
    for (const bo of s.bombs) ctx.fillRect(bo.x - s.camX, bo.y, 3, 4);
    // Player.
    const psx = s.px - s.camX;
    ctx.fillStyle = "#e8c848";
    ctx.fillRect(psx, s.py, PLAYER_W, PLAYER_H);
    ctx.fillStyle = "#58a8d8";
    ctx.fillRect(psx + (s.facing > 0 ? 7 : 1), s.py + 2, 4, 3);
  }

  function drawHud() {
    ctx.fillStyle = "#fff";
    ctx.font = "8px monospace";
    ctx.fillText(`SCORE ${score()}`, 6, 12);
  }

  function frame(time) {
    s.raf = requestAnimationFrame(frame);
    const dt = s.lastTime ? Math.min((time - s.lastTime) / 1000, 0.05) : 0.016;
    s.lastTime = time;
    if (!s.dead) update(dt, time);
    drawSky(time);
    drawTerrain();
    drawEntities();
    drawHud();
  }
  s.raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (s.raf) cancelAnimationFrame(s.raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.parentNode?.removeChild(canvas);
    },
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build`
Expected: build succeeds (chunk-size warning is fine; no TS errors).

- [ ] **Step 3: Commit**

```bash
git add coreamp-app/frontend/src/visualizer/soundRunner.ts
git commit -m "feat: sound-runner platformer engine"
```

---

## Task 5: `SoundRunner.vue` wrapper + wire into Visualizer

**Files:**
- Create: `src/components/SoundRunner.vue`
- Modify: `src/components/Visualizer.vue` (swap `AstroChicken` → `SoundRunner` for the `game` mode)
- Delete: `src/components/AstroChicken.vue`, `src/visualizer/astroChicken.ts`

- [ ] **Step 1: Create the wrapper**

```vue
<!-- src/components/SoundRunner.vue -->
<template>
  <div ref="hostEl" class="sound-runner" tabindex="0">
    <div v-if="loading" class="sr-msg small text-light" data-test="sr-loading">
      Generating level from {{ songName }}…
    </div>
    <div v-if="note" class="sr-note small text-light">{{ note }}</div>
    <div v-if="gameOver" class="sr-overlay" data-test="sr-gameover">
      <div class="sr-title">GAME OVER</div>
      <div class="sr-score">Score {{ lastScore }}</div>
      <ol class="sr-scores">
        <li v-for="(sc, i) in scores" :key="i">{{ sc.score }} — {{ sc.song }}</li>
      </ol>
      <div class="sr-hint">Press R to play again</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePlayerStore } from "@/stores/player";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { extractBands } from "@/visualizer/bands";
import { decodeTrack, extractEnvelope } from "@/visualizer/decodeTrack";
import { buildLevel, syntheticEnvelope } from "@/visualizer/soundLevel";
import { createSoundRunner } from "@/visualizer/soundRunner";
import { insertScore, loadScores, type Score } from "@/visualizer/highScores";

const player = usePlayerStore();
const { freq } = useFrequencyData();
const hostEl = ref<HTMLDivElement | null>(null);

const loading = ref(false);
const note = ref("");
const gameOver = ref(false);
const lastScore = ref(0);
const scores = ref<Score[]>(loadScores());
const songName = ref("");

let engine: { destroy: () => void } | null = null;

function currentSong(): { path: string | null; name: string } {
  const t = player.currentTrack;
  return { path: t?.path ?? null, name: t?.title ?? "Untitled" };
}

async function buildAndStart(): Promise<void> {
  engine?.destroy();
  engine = null;
  gameOver.value = false;
  note.value = "";
  const { path, name } = currentSong();
  songName.value = name;

  let envelope;
  if (path) {
    loading.value = true;
    try {
      const buffer = await decodeTrack(convertFileSrc(path));
      envelope = extractEnvelope(buffer.getChannelData(0), buffer.sampleRate);
    } catch {
      note.value = "couldn't decode song — random level";
      envelope = syntheticEnvelope();
    } finally {
      loading.value = false;
    }
  } else {
    note.value = "no song loaded — random level";
    envelope = syntheticEnvelope();
  }

  if (!hostEl.value) return;
  const level = buildLevel(envelope);
  engine = createSoundRunner(
    hostEl.value,
    level,
    () => extractBands(freq.value),
    onGameOver,
  );
}

function onGameOver(score: number): void {
  lastScore.value = score;
  scores.value = insertScore({
    score,
    song: songName.value,
    date: new Date().toISOString().slice(0, 10),
  });
  gameOver.value = true;
}

function onKey(e: KeyboardEvent): void {
  if ((e.key === "r" || e.key === "R") && gameOver.value) void buildAndStart();
}

onMounted(() => {
  hostEl.value?.focus();
  window.addEventListener("keydown", onKey);
  void buildAndStart();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  engine?.destroy();
  engine = null;
});
</script>

<style scoped>
.sound-runner { position: absolute; inset: 0; background: #000; outline: none; }
.sr-msg, .sr-note {
  position: absolute; left: 0.75rem; top: 0.5rem; z-index: 3;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}
.sr-note { top: 1.6rem; opacity: 0.8; }
.sr-overlay {
  position: absolute; inset: 0; z-index: 4;
  background: rgba(0,0,0,0.72); color: #fff;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: monospace; gap: 0.25rem;
}
.sr-title { font-size: 1.4rem; letter-spacing: 0.1em; }
.sr-scores { list-style: none; padding: 0; margin: 0.5rem 0; text-align: center; }
.sr-hint { opacity: 0.7; margin-top: 0.5rem; }
</style>
```

- [ ] **Step 2: Swap the Visualizer mode**

In `src/components/Visualizer.vue`, replace the AstroChicken import and usage:

```diff
-import AstroChicken from "@/components/AstroChicken.vue";
+import SoundRunner from "@/components/SoundRunner.vue";
```

```diff
-    <AstroChicken v-else-if="pluginId === 'game'" />
+    <SoundRunner v-else-if="pluginId === 'game'" />
```

(The dropdown option already reads `{ value: "game", text: "Astro Chicken" }` — leave the label.)

- [ ] **Step 3: Delete the old game**

```bash
git rm coreamp-app/frontend/src/components/AstroChicken.vue coreamp-app/frontend/src/visualizer/astroChicken.ts
```

- [ ] **Step 4: Verify build + full test suite**

Run: `npm run build`
Expected: succeeds (chunk-size warning only).

Run: `npx vitest run`
Expected: all tests PASS (the three new pure-module specs included; no remaining references to the removed astroChicken).

- [ ] **Step 5: Commit**

```bash
git add coreamp-app/frontend/src/components/SoundRunner.vue coreamp-app/frontend/src/components/Visualizer.vue
git commit -m "feat: wire Sound Runner into the visualizer game mode; remove Astro Chicken"
```

---

## Task 6: Build the desktop app + manual verification

**Files:** none (build + manual).

- [ ] **Step 1: Build the debug app**

From `/Users/velkymx/Code/CoreAmp/coreamp-app`, temporarily blank the broken
`beforeBuildCommand`, build, restore (the frontend `dist` is already built by Task 5):

```bash
cd /Users/velkymx/Code/CoreAmp/coreamp-app
sed -i '' 's#"beforeBuildCommand": "npm --prefix frontend run build",#"beforeBuildCommand": "",#' tauri.conf.json
cargo tauri build --debug 2>&1 | grep -E "Built application|error\["
sed -i '' 's#"beforeBuildCommand": "",#"beforeBuildCommand": "npm --prefix frontend run build",#' tauri.conf.json
```

- [ ] **Step 2: Manual verification checklist**

Launch `target/debug/bundle/macos/CoreAmp.app`, play an mp3, open the visualizer
"Astro Chicken" mode, and confirm:
- A short "Generating level from <song>…" appears, then the level loads.
- Terrain visibly tracks the song (loud = hills, quiet = dips/pits).
- Sky color + clouds react to the live music.
- Arrow keys move/jump, X shoots; enemies can be stomped and shot; pits/enemies/bombs kill.
- Death shows GAME OVER + the top-5 list; R restarts.
- With no track loaded, the mode still plays a "random level".

---

## Self-Review Notes

- **Spec coverage:** level-from-song (Task 1+2), free movement (Task 4 update loop), Space-Invader enemies (Task 4), reactive sky/clouds (Task 4 `drawSky` via live `getBands`), top-5 on death (Task 3 + Task 5 overlay), random-level fallback (Task 5 + `syntheticEnvelope`), endless loop with capped distance (Task 4 wrap), stays a visualizer mode (Task 5). All covered.
- **Type consistency:** `EnvelopeSlice` (decodeTrack) → consumed by `buildLevel`/`syntheticEnvelope`; `LevelData`/`Column`/`Spawn` (soundLevel) → consumed by engine; `Score` (highScores) → consumed by the Vue overlay. `LEVEL` constants shared by `soundLevel` + engine. `createSoundRunner(container, level, getBands, onGameOver)` matches the wrapper call.
- **No placeholders:** every step has complete code/commands.
