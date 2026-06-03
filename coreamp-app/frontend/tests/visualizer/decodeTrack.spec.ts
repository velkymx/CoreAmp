import { describe, it, expect } from "vitest";
import { extractEnvelope } from "@/visualizer/decodeTrack";

describe("extractEnvelope", () => {
  it("returns one slice per window and zero for silence", () => {
    const sr = 1000; // 1000 samples/sec → 40ms window = 40 samples
    const channel = new Float32Array(400); // 0.4s → 10 slices
    const env = extractEnvelope(channel, sr, 40);
    expect(env).toHaveLength(10);
    expect(env.every((s) => s.rms === 0 && s.bass === 0)).toBe(true);
  });

  it("normalizes rms to a 0..1 peak of 1", () => {
    const sr = 1000;
    const channel = new Float32Array(120); // 3 slices
    for (let i = 0; i < 40; i++) channel[i] = 0.1;
    for (let i = 40; i < 80; i++) channel[i] = 1.0;
    for (let i = 80; i < 120; i++) channel[i] = 0.5;
    const env = extractEnvelope(channel, sr, 40);
    expect(env).toHaveLength(3);
    expect(env[1].rms).toBeCloseTo(1, 5);
    expect(env[0].rms).toBeLessThan(env[2].rms);
    expect(env[2].rms).toBeLessThan(env[1].rms);
  });

  it("reports bass energy for a low-frequency-only signal", () => {
    const sr = 4000;
    const channel = new Float32Array(4000);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.sin((2 * Math.PI * 50 * i) / sr);
    }
    const env = extractEnvelope(channel, sr, 40);
    expect(env.some((s) => s.bass > 0.5)).toBe(true);
  });

  it("handles an empty channel", () => {
    expect(extractEnvelope(new Float32Array(0), 1000, 40)).toEqual([]);
  });
});
