import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ChickenLanderGame from "@/components/ChickenLanderGame.vue";
import { useUiStore } from "@/stores/ui";

vi.mock("@/playback/webDriver", () => ({ webDriver: { getAnalyser: () => null } }));

describe("ChickenLanderGame", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("renders the game canvas and a close button", () => {
    const w = mount(ChickenLanderGame);
    expect(w.find(".cl-canvas").exists()).toBe(true);
    expect(w.find('[data-test="cl-close"]').exists()).toBe(true);
  });

  it("claims the keyboard (suppresses global shortcuts) while mounted, releases on unmount", () => {
    const ui = useUiStore();
    const w = mount(ChickenLanderGame);
    expect(ui.interactiveVisualizer).toBe(true);
    w.unmount();
    expect(ui.interactiveVisualizer).toBe(false);
  });

  it("emits close from the exit button", async () => {
    const w = mount(ChickenLanderGame);
    await w.get('[data-test="cl-close"]').trigger("click");
    expect(w.emitted("close")).toBeTruthy();
  });
});
