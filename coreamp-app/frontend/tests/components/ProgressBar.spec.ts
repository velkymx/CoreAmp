import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ProgressBar from "@/components/ProgressBar.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeSlider: {
    props: ["modelValue", "min", "max", "step"],
    emits: ["update:modelValue"],
    template:
      '<input type="range" :value="modelValue" :max="max" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
};

describe("ProgressBar", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("scrubbing the slider calls player.seek with the new position", async () => {
    const wrapper = mount(ProgressBar, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ durationSecs: 120, positionSecs: 0 });
    await wrapper.vm.$nextTick();
    const spy = vi.spyOn(player, "seek").mockResolvedValue();
    await wrapper.get("input").setValue(45);
    expect(spy).toHaveBeenCalledWith(45);
  });

  it("renders current position and duration as m:ss", async () => {
    const wrapper = mount(ProgressBar, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ durationSecs: 125, positionSecs: 65 });
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("1:05");
    expect(wrapper.text()).toContain("2:05");
  });
});
