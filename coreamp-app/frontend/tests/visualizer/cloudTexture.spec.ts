import { describe, it, expect } from "vitest";
import { fbm, cloudDensity } from "@/visualizer/cloudTexture";

describe("fbm", () => {
  it("is deterministic for the same inputs", () => {
    expect(fbm(1.5, 2.5, 7)).toBe(fbm(1.5, 2.5, 7));
  });

  it("stays within 0..1", () => {
    for (let i = 0; i < 50; i++) {
      const v = fbm(i * 0.37, i * 0.91, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("varies across the field (not a constant)", () => {
    const a = fbm(0.2, 0.2, 1);
    const b = fbm(3.8, 2.1, 1);
    expect(a).not.toBe(b);
  });
});

describe("cloudDensity", () => {
  it("feathers to zero at the corners (radial mask)", () => {
    expect(cloudDensity(0, 0, 5)).toBe(0);
    expect(cloudDensity(1, 1, 5)).toBe(0);
  });

  it("can produce visible density near the centre", () => {
    let maxCentre = 0;
    for (let s = 0; s < 40; s++) {
      maxCentre = Math.max(maxCentre, cloudDensity(0.5, 0.5, s));
    }
    expect(maxCentre).toBeGreaterThan(0);
  });

  it("always returns a clamped 0..1 alpha", () => {
    for (let i = 0; i < 100; i++) {
      const v = cloudDensity((i % 10) / 10, Math.floor(i / 10) / 10, i);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
