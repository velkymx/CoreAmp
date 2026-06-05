import { describe, it, expect } from "vitest";
import { buildShuffleOrder } from "@/util/shuffle";

describe("buildShuffleOrder", () => {
  it("starts with the current index so the current track is not interrupted", () => {
    const order = buildShuffleOrder(5, 2);
    expect(order[0]).toBe(2);
  });

  it("returns a permutation of every queue index exactly once", () => {
    const order = buildShuffleOrder(5, 2);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("is deterministic for a given rng", () => {
    // rng always returns 0 -> Fisher-Yates picks the first remaining each step,
    // leaving the rest in ascending order after the current index.
    const order = buildShuffleOrder(5, 2, () => 0);
    expect(order).toEqual([2, 0, 1, 3, 4]);
  });

  it("handles an empty or single-track queue", () => {
    expect(buildShuffleOrder(0, -1)).toEqual([]);
    expect(buildShuffleOrder(1, 0)).toEqual([0]);
  });
});
