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
    expect(loadScores().map((s) => s.score)).toEqual([90, 70, 50, 30, 20]);
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
