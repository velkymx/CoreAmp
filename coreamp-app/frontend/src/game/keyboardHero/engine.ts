// Pure game logic for Keyboard Hero. No DOM, no audio, no three.js — just the
// rules (chart generation, timing judgement, scoring, combos, accuracy) so they
// can be tested deterministically. The Vue component drives the highway and
// feeds these functions.

// Six home-row lanes: S D F J K L.
export const LANE_KEYS = ["s", "d", "f", "j", "k", "l"] as const;
export const LANE_COUNT = LANE_KEYS.length;

export interface Note {
  lane: number; // 0..LANE_COUNT-1
  time: number; // seconds from track start
}

export type Judgement = "perfect" | "good" | "miss";

export const PERFECT_WINDOW = 0.05; // ±50 ms
export const GOOD_WINDOW = 0.12; // ±120 ms

// Deterministically chart the detected onset times into lane notes. A note's
// lane is derived from its time so the same track always charts the same way;
// every 4th onset spawns a 2-note chord on two different lanes.
export function generateChart(onsets: number[], laneCount = LANE_COUNT): Note[] {
  const notes: Note[] = [];
  onsets.forEach((time, i) => {
    const lane = Math.abs(Math.floor(time * 1000) + i) % laneCount;
    notes.push({ lane, time });
    if (i % 4 === 3) {
      const second = (lane + 1 + (i % (laneCount - 1))) % laneCount;
      if (second !== lane) notes.push({ lane: second, time });
    }
  });
  return notes;
}

// Stable 32-bit hash of a string (e.g. a track path) → a per-song seed.
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Build a full, deterministic note chart for a song so every playthrough is the
// same "level". Seeded by the track (via `hashString(path)`), it lays down a
// steady stream of notes for the whole duration with a gentle density swell
// through the middle and occasional chords. Same seed + duration → same chart.
export function buildSongChart(seed: number, durationSecs: number, laneCount = LANE_COUNT): Note[] {
  const notes: Note[] = [];
  const start = 3; // lead-in before the first note
  const end = durationSecs - 2;
  if (end <= start) return notes;

  const rng = mulberry32(seed);
  let lastLane = -1;
  let time = start;
  while (time < end) {
    const frac = (time - start) / (end - start);
    // Density envelope: busiest around the middle of the track.
    const env = 0.5 + 0.5 * Math.sin((frac - 0.25) * Math.PI * 2);
    const gap = 0.3 + (1 - Math.max(0, env)) * 0.4; // 0.30 .. 0.70 s

    let lane = Math.floor(rng() * laneCount);
    if (lane === lastLane) lane = (lane + 1) % laneCount;
    notes.push({ lane, time });
    lastLane = lane;

    if (rng() < 0.12) {
      let l2 = Math.floor(rng() * laneCount);
      if (l2 === lane) l2 = (l2 + 2) % laneCount;
      notes.push({ lane: l2, time });
    }
    time += gap;
  }
  return notes;
}

// Live onset detection: the current energy clearly exceeds the running average
// (a beat/transient). Used to spawn notes in real time from the spectrum.
export function isOnset(energy: number, runningAvg: number, sensitivity = 1.45): boolean {
  return energy > 0.06 && energy > runningAvg * sensitivity;
}

// Pick a lane for a spawned note from the dominant band + a counter, so notes
// spread across lanes without RNG.
export function laneForSpawn(bandIndex: number, counter: number, laneCount = LANE_COUNT): number {
  return Math.abs(bandIndex * 2 + counter) % laneCount;
}

// Judge a hit by how far (seconds) it landed from the note's target time.
export function judge(deltaSecs: number): Judgement {
  const d = Math.abs(deltaSecs);
  if (d <= PERFECT_WINDOW) return "perfect";
  if (d <= GOOD_WINDOW) return "good";
  return "miss";
}

export function scoreFor(judgement: Judgement): number {
  if (judgement === "perfect") return 100;
  if (judgement === "good") return 50;
  return 0;
}

// Combo continues on any hit, resets on a miss.
export function nextCombo(combo: number, judgement: Judgement): number {
  return judgement === "miss" ? 0 : combo + 1;
}

// Guitar-Hero-style score multiplier that climbs with the combo (x1 → x4).
export function comboMultiplier(combo: number): number {
  if (combo >= 30) return 4;
  if (combo >= 20) return 3;
  if (combo >= 10) return 2;
  return 1;
}

// Celebratory message at combo milestones (null otherwise).
export function comboMessage(combo: number): string | null {
  switch (combo) {
    case 10:
      return "Nice!";
    case 25:
      return "Rock On!";
    case 50:
      return "Amazing!";
    case 100:
      return "Unstoppable!";
    default:
      return null;
  }
}

// Accuracy percentage (0..100): perfect = 1, good = 0.5, miss = 0.
export function accuracy(perfect: number, good: number, miss: number): number {
  const total = perfect + good + miss;
  if (total === 0) return 0;
  return Math.round(((perfect + good * 0.5) / total) * 100);
}
