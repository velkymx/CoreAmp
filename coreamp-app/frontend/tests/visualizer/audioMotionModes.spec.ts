import { describe, it, expect, beforeEach } from "vitest";
import {
  audioMotionOptions,
  loadAudioMotionMode,
  persistAudioMotionMode,
  AUDIOMOTION_MODES,
} from "@/visualizer/audioMotionModes";

describe("audioMotionOptions", () => {
  it("LED mode enables ledBars only", () => {
    const o = audioMotionOptions("led");
    expect(o.ledBars).toBe(true);
    expect(o.lumiBars).toBe(false);
    expect(o.roundBars).toBe(false);
    expect(o.radial).toBe(false);
  });

  it("radial mode enables radial only", () => {
    const o = audioMotionOptions("radial");
    expect(o.radial).toBe(true);
    expect(o.ledBars).toBe(false);
  });

  it("round mode adds reflection", () => {
    expect(audioMotionOptions("round").roundBars).toBe(true);
    expect(audioMotionOptions("round").reflexRatio).toBeGreaterThan(0);
  });

  it("lumi mode enables lumiBars only", () => {
    expect(audioMotionOptions("lumi").lumiBars).toBe(true);
  });

  it("unknown mode falls back to plain bars", () => {
    const o = audioMotionOptions("nope" as never);
    expect(o).toEqual(audioMotionOptions("bars"));
  });

  it("returns a fresh object (no shared mutation)", () => {
    const a = audioMotionOptions("bars");
    a.radial = true;
    expect(audioMotionOptions("bars").radial).toBe(false);
  });

  it("exposes all five modes for the selector", () => {
    expect(AUDIOMOTION_MODES.map((m) => m.value)).toEqual([
      "bars",
      "led",
      "round",
      "radial",
      "lumi",
    ]);
  });
});

describe("audioMotion mode persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to bars and round-trips a stored mode", () => {
    expect(loadAudioMotionMode()).toBe("bars");
    persistAudioMotionMode("radial");
    expect(loadAudioMotionMode()).toBe("radial");
  });

  it("ignores an invalid stored value", () => {
    localStorage.setItem("coreamp.audiomotion.mode", "bogus");
    expect(loadAudioMotionMode()).toBe("bars");
  });
});
