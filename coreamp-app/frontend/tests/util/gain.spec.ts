import { describe, it, expect } from "vitest";
import { dbToGain, replayGainMultiplier } from "@/util/gain";

describe("dbToGain", () => {
  it("maps 0 dB to unity", () => {
    expect(dbToGain(0)).toBeCloseTo(1, 6);
  });

  it("maps -6 dB to ~0.501 and +6 dB to ~1.995", () => {
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
    expect(dbToGain(6)).toBeCloseTo(1.9953, 3);
  });
});

describe("replayGainMultiplier", () => {
  it("returns unity for no ReplayGain", () => {
    expect(replayGainMultiplier(null)).toBe(1);
    expect(replayGainMultiplier(undefined)).toBe(1);
    expect(replayGainMultiplier(Number.NaN)).toBe(1);
  });

  it("attenuates a loud (negative-gain) track", () => {
    expect(replayGainMultiplier(-6.48)).toBeLessThan(1);
    expect(replayGainMultiplier(-6.48)).toBeGreaterThan(0);
  });

  it("clamps extreme tags to a safe range", () => {
    // +100 dB would be ~100000x without clamping; clamp caps at +24 dB.
    expect(replayGainMultiplier(100)).toBeCloseTo(dbToGain(24), 6);
    expect(replayGainMultiplier(-100)).toBeCloseTo(dbToGain(-24), 6);
  });
});
