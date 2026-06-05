import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const state = vi.hoisted(() => ({
  mode: { value: "auto" as "auto" | "light" | "dark" },
  set: vi.fn(),
}));

vi.mock("@velkymx/vibeui", () => ({
  useColorMode: () => ({ colorMode: state.mode, setColorMode: state.set }),
}));

import ThemeToggle from "@/components/ThemeToggle.vue";

const stubs = {
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
};

describe("ThemeToggle", () => {
  beforeEach(() => {
    state.mode.value = "auto";
    state.set.mockClear();
  });

  it("cycles auto → light on click", async () => {
    const w = mount(ThemeToggle, { global: { stubs } });
    await w.get('[data-test="theme-toggle"]').trigger("click");
    expect(state.set).toHaveBeenCalledWith("light");
  });

  it("wraps dark → auto", async () => {
    state.mode.value = "dark";
    const w = mount(ThemeToggle, { global: { stubs } });
    await w.get('[data-test="theme-toggle"]').trigger("click");
    expect(state.set).toHaveBeenCalledWith("auto");
  });

  it("shows the current mode label + icon", () => {
    state.mode.value = "light";
    const w = mount(ThemeToggle, { global: { stubs } });
    expect(w.text()).toContain("Light");
    expect(w.find('[data-icon="sun-fill"]').exists()).toBe(true);
  });
});
