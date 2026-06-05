import { describe, it, expect } from "vitest";
import { shouldStartCrossfade } from "@/util/crossfade";

describe("shouldStartCrossfade", () => {
  it("is off when crossfadeSecs is 0", () => {
    expect(shouldStartCrossfade(95, 100, 0, true)).toBe(false);
  });

  it("is off when there is no next track", () => {
    expect(shouldStartCrossfade(95, 100, 5, false)).toBe(false);
  });

  it("triggers once inside the fade window near the end", () => {
    expect(shouldStartCrossfade(96, 100, 5, true)).toBe(true);
    expect(shouldStartCrossfade(94.9, 100, 5, true)).toBe(false);
  });

  it("does not trigger past the duration", () => {
    expect(shouldStartCrossfade(101, 100, 5, true)).toBe(false);
  });

  it("skips tracks shorter than twice the fade", () => {
    expect(shouldStartCrossfade(8, 9, 5, true)).toBe(false);
  });

  it("is off without a known duration", () => {
    expect(shouldStartCrossfade(95, null, 5, true)).toBe(false);
    expect(shouldStartCrossfade(95, 0, 5, true)).toBe(false);
  });
});
