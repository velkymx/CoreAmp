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
