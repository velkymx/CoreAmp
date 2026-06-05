import { describe, it, expect } from "vitest";
import { aggregateBars, waveAmplitude } from "@/visualizer/scale";
import { getPlugin, visualizerPlugins } from "@/visualizer/registry";

describe("aggregateBars", () => {
  it("returns the requested number of bars in 0..1", () => {
    const freq = new Uint8Array(1024).fill(128);
    const bars = aggregateBars(freq, 48);
    expect(bars).toHaveLength(48);
    expect(bars.every((b) => b >= 0 && b <= 1)).toBe(true);
    expect(bars[10]).toBeCloseTo(0.5, 1);
  });

  it("a rising frequency ramp produces higher bars toward the top end", () => {
    const freq = new Uint8Array(1024);
    for (let i = 0; i < freq.length; i++) freq[i] = Math.floor((i / freq.length) * 255);
    const bars = aggregateBars(freq, 16);
    expect(bars[15]).toBeGreaterThan(bars[0]);
  });

  it("handles empty input and zero bars", () => {
    expect(aggregateBars(new Uint8Array(0), 8)).toEqual([]);
    expect(aggregateBars(new Uint8Array(16).fill(10), 0)).toEqual([]);
  });
});

describe("waveAmplitude", () => {
  it("maps 0..255 to -1..1 around the 128 midpoint", () => {
    expect(waveAmplitude(128)).toBeCloseTo(0);
    expect(waveAmplitude(255)).toBeCloseTo(0.99, 1);
    expect(waveAmplitude(0)).toBe(-1);
  });
});

describe("visualizer registry", () => {
  it("exposes bars / spectrum / oscilloscope plugins", () => {
    expect(visualizerPlugins.map((p) => p.id)).toEqual([
      "bars",
      "spectrum",
      "oscilloscope",
    ]);
  });

  it("getPlugin falls back to bars for an unknown id", () => {
    expect(getPlugin("nope").id).toBe("bars");
    expect(getPlugin("oscilloscope").id).toBe("oscilloscope");
  });

  it("each plugin draws against a 2D-context-like stub without throwing", () => {
    const calls: string[] = [];
    const ctx = {
      clearRect: () => calls.push("clear"),
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
    } as unknown as CanvasRenderingContext2D;
    const frame = {
      freq: new Uint8Array(1024).fill(100),
      wave: new Uint8Array(2048).fill(140),
      t: 0,
      active: true,
    };
    for (const p of visualizerPlugins) {
      expect(() => p.draw(ctx, 320, 120, frame)).not.toThrow();
    }
    expect(calls.length).toBe(visualizerPlugins.length);
  });
});
