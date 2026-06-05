import { describe, it, expect } from "vitest";
import { orbRotationSpeed } from "@/visualizer/orb";

describe("orbRotationSpeed", () => {
  it("idles slowly in silence", () => {
    const speed = orbRotationSpeed({ bass: 0, mid: 0, treble: 0 });
    expect(speed).toBeCloseTo(0.002, 5);
  });

  it("spins faster as energy rises", () => {
    const quiet = orbRotationSpeed({ bass: 0.1, mid: 0.1, treble: 0.1 });
    const loud = orbRotationSpeed({ bass: 1, mid: 1, treble: 1 });
    expect(loud).toBeGreaterThan(quiet);
    expect(quiet).toBeGreaterThan(0.002);
  });

  it("weights bass over treble for the same total level", () => {
    const bassy = orbRotationSpeed({ bass: 1, mid: 0, treble: 0 });
    const trebly = orbRotationSpeed({ bass: 0, mid: 0, treble: 1 });
    expect(bassy).toBeGreaterThan(trebly);
  });

  it("never returns a negative increment", () => {
    expect(orbRotationSpeed({ bass: -1, mid: -1, treble: -1 })).toBe(0.002);
  });
});
