import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import VolumeControl from "@/components/VolumeControl.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
  VibeSlider: {
    props: ["modelValue", "min", "max", "step"],
    emits: ["update:modelValue"],
    template:
      '<input type="range" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
};

describe("VolumeControl", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("clicking the speaker toggles mute", async () => {
    const wrapper = mount(VolumeControl, { global: { stubs } });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "toggleMute").mockResolvedValue();
    await wrapper.get('[data-test="mute"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("dragging the slider sets the volume", async () => {
    const wrapper = mount(VolumeControl, { global: { stubs } });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "setVolume").mockResolvedValue();
    await wrapper.get("input").setValue(0.3);
    expect(spy).toHaveBeenCalledWith(0.3);
  });

  it("shows the muted icon when muted", async () => {
    const wrapper = mount(VolumeControl, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ muted: true });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="volume-mute-fill"]').exists()).toBe(true);
  });
});
