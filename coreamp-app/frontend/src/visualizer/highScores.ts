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
    return parsed.filter((s) => typeof s?.score === "number").slice(0, MAX);
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
