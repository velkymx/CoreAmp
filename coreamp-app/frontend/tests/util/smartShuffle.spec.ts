import { describe, it, expect } from "vitest";
import { trackSimilarity, smartShuffleOrder } from "@/util/smartShuffle";

const t = (artist: string | null, album: string | null) => ({ artist, album });

describe("trackSimilarity", () => {
  it("weights same artist over same album", () => {
    const seed = t("Aurora", "Skyline");
    expect(trackSimilarity(seed, t("Aurora", "Other"))).toBe(3);
    expect(trackSimilarity(seed, t("Other", "Skyline"))).toBe(2);
    expect(trackSimilarity(seed, t("Aurora", "Skyline"))).toBe(5);
    expect(trackSimilarity(seed, t("Nobody", "Nothing"))).toBe(0);
  });

  it("ignores null fields", () => {
    expect(trackSimilarity(t(null, null), t(null, null))).toBe(0);
    expect(trackSimilarity(t("A", null), t("A", null))).toBe(3);
  });
});

describe("smartShuffleOrder", () => {
  const tracks = [
    t("Aurora", "Skyline"), // 0 seed
    t("Aurora", "Skyline"), // 1 same artist + album → highest
    t("Aurora", "Other"), // 2 same artist
    t("Stranger", "Far"), // 3 unrelated
  ];

  it("puts the seed first and ranks the most similar next (no jitter)", () => {
    const order = smartShuffleOrder(tracks, 0, () => 0);
    expect(order[0]).toBe(0);
    expect(order[1]).toBe(1); // artist+album match
    expect(order[2]).toBe(2); // artist match
    expect(order[3]).toBe(3); // unrelated last
  });

  it("includes every index exactly once", () => {
    const order = smartShuffleOrder(tracks, 2, () => 0.5);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(order[0]).toBe(2);
  });

  it("handles an empty queue", () => {
    expect(smartShuffleOrder([], 0)).toEqual([]);
  });
});
