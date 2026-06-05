import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import KeyboardHeroGame from "@/components/KeyboardHeroGame.vue";

// No WebGL in jsdom: loadThree resolves null so init is skipped, but the HUD +
// lane overlay (plain DOM) still render.
vi.mock("@/visualizer/loadVendor", () => ({ loadThree: vi.fn().mockResolvedValue(null) }));
vi.mock("@/playback/webDriver", () => ({ webDriver: { getAnalyser: () => null } }));

describe("KeyboardHeroGame", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders six home-row lane labels", () => {
    const w = mount(KeyboardHeroGame);
    const labels = w.findAll(".kh-lane-label").map((l) => l.text());
    expect(labels).toEqual(["S", "D", "F", "J", "K", "L"]);
  });

  it("starts the score at zero", () => {
    const w = mount(KeyboardHeroGame);
    expect(w.get('[data-test="kh-score"]').text()).toBe("0");
  });

  it("does not show results until the song ends", () => {
    const w = mount(KeyboardHeroGame);
    expect(w.find('[data-test="kh-results"]').exists()).toBe(false);
  });
});
