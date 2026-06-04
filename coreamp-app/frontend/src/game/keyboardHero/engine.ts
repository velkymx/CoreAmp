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
