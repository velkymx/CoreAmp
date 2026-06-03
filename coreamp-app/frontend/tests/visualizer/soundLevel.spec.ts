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
    expect(loud).toBeLessThan(quiet);
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
