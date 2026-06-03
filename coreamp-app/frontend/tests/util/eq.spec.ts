import { describe, it, expect } from "vitest";
import { eqCurveDb, eqFrequencyAxis } from "@/util/eq";
import type { EqBand } from "@/types";

const band = (frequency: number, gain: number, q = 1): EqBand => ({
  frequency,
  gain,
  q,
});

describe("eqFrequencyAxis", () => {
  it("spans 20 Hz to 20 kHz, log-spaced and ascending", () => {
    const axis = eqFrequencyAxis(96);
    expect(axis).toHaveLength(96);
    expect(axis[0]).toBeCloseTo(20, 0);
    expect(axis[95]).toBeCloseTo(20000, -1);
    for (let i = 1; i < axis.length; i++) expect(axis[i]).toBeGreaterThan(axis[i - 1]);
  });
});

describe("eqCurveDb", () => {
  it("is flat (~0 dB) when all gains are zero", () => {
    const freqs = eqFrequencyAxis(48);
    const curve = eqCurveDb([band(1000, 0)], freqs);
    expect(curve.every((db) => Math.abs(db) < 1e-6)).toBe(true);
  });

  it("peaks near the band centre when boosted", () => {
    const freqs = [125, 250, 1000, 4000, 16000];
    const curve = eqCurveDb([band(1000, 12, 1)], freqs);
    const peakIndex = curve.indexOf(Math.max(...curve));
    expect(freqs[peakIndex]).toBe(1000);
    expect(curve[peakIndex]).toBeGreaterThan(6);
  });

  it("dips below zero when a band is cut", () => {
    const curve = eqCurveDb([band(1000, -12, 1)], [1000]);
    expect(curve[0]).toBeLessThan(-6);
  });
});
