import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import AudioMotionViz from "@/components/AudioMotionViz.vue";

// Audio engine reports "not ready" so no real AudioMotion instance is created;
// we only exercise the mode picker + persistence.
vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    ensureGraph: vi.fn(),
    getAudioContext: () => null,
    getVizSource: () => null,
  },
}));

describe("AudioMotionViz mode picker", () => {
  beforeEach(() => localStorage.clear());

  it("renders the five display modes", () => {
    const w = mount(AudioMotionViz);
    const options = w.findAll('[data-test="audiomotion-mode"] option');
    expect(options.map((o) => o.text())).toEqual([
      "Bars",
      "LED Bars",
      "Round + Reflect",
      "Radial",
      "LumiBars",
    ]);
  });

  it("persists the chosen mode", async () => {
    const w = mount(AudioMotionViz);
    await w.get('[data-test="audiomotion-mode"]').setValue("radial");
    expect(localStorage.getItem("coreamp.audiomotion.mode")).toBe("radial");
  });

  it("restores the persisted mode on mount", () => {
    localStorage.setItem("coreamp.audiomotion.mode", "lumi");
    const w = mount(AudioMotionViz);
    expect(
      (w.get('[data-test="audiomotion-mode"]').element as HTMLSelectElement).value,
    ).toBe("lumi");
  });
});
