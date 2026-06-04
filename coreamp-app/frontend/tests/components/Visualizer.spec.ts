import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import Visualizer from "@/components/Visualizer.vue";

vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    getAnalyser: vi.fn(() => null),
    ensureGraph: vi.fn(),
    getAudioContext: vi.fn(() => null),
    getVizSource: vi.fn(() => null),
  },
}));

const stubs = {
  VibeFormSelect: {
    props: ["modelValue", "options"],
    template: "<select></select>",
  },
};

describe("Visualizer", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("defaults to the EQ visualizer and shows the plugin selector", () => {
    const w = mount(Visualizer, { global: { stubs } });
    expect(w.find('[data-test="audiomotion-viz"]').exists()).toBe(true);
    expect(w.find('[data-test="viz-plugin"]').exists()).toBe(true);
  });

  it("exposes a fullscreen toggle", () => {
    const w = mount(Visualizer, { global: { stubs } });
    expect(w.find('[data-test="viz-fullscreen"]').exists()).toBe(true);
  });
});
