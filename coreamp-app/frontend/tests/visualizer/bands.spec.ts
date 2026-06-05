import { describe, it, expect } from "vitest";
import { extractBands } from "@/visualizer/bands";

describe("extractBands", () => {
  it("returns zeroed bands for silence", () => {
    const b = extractBands(new Uint8Array(1024));
    expect(b).toEqual({ bass: 0, mid: 0, treble: 0 });
  });

  it("scales each band into 0..1 and clamps at 1", () => {
    const b = extractBands(new Uint8Array(1024).fill(255));
    expect(b.bass).toBe(1);
    expect(b.mid).toBe(1);
    expect(b.treble).toBe(1);
  });

  it("boosts higher bands more (so mid/treble are usable)", () => {
    // Uniform mid-level energy across the spectrum.
    const b = extractBands(new Uint8Array(1024).fill(60));
    expect(b.treble).toBeGreaterThan(b.mid);
    expect(b.mid).toBeGreaterThan(b.bass);
  });
});
