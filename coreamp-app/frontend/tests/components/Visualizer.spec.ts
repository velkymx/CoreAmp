import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import Visualizer from "@/components/Visualizer.vue";
import { usePlayerStore } from "@/stores/player";

vi.mock("@/api/tauri", () => ({
  nativeAudioStop: vi.fn().mockResolvedValue(undefined),
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  recordPlay: vi.fn().mockResolvedValue(undefined),
  readTrackArtwork: vi.fn().mockResolvedValue(null),
  readTrackSignalDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    getAnalyser: vi.fn(() => null),
    load: vi.fn(),
    setVolume: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    isLoaded: vi.fn(() => false),
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

  it("renders a canvas and the plugin selector", () => {
    const w = mount(Visualizer, { global: { stubs } });
    expect(w.find("canvas").exists()).toBe(true);
    expect(w.find('[data-test="viz-plugin"]').exists()).toBe(true);
  });

  it("shows the switch-to-web hint when on native output and not active", async () => {
    const w = mount(Visualizer, { global: { stubs } });
    usePlayerStore().$patch({ source: "native", nativeAvailable: true });
    await w.vm.$nextTick();
    expect(w.find('[data-test="viz-use-web"]').exists()).toBe(true);
  });

  it("the hint switches the player to web output", async () => {
    const w = mount(Visualizer, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ source: "native", nativeAvailable: true });
    await w.vm.$nextTick();
    const spy = vi.spyOn(player, "setSource").mockResolvedValue();
    await w.get('[data-test="viz-use-web"]').trigger("click");
    expect(spy).toHaveBeenCalledWith("web");
  });
});
