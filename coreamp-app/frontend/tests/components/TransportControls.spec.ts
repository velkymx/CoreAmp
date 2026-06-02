import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TransportControls from "@/components/TransportControls.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["name"], template: '<i :data-icon="name"></i>' },
};

describe("TransportControls", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("clicking play/pause calls the store action", async () => {
    const wrapper = mount(TransportControls, { global: { stubs } });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "togglePlayback").mockResolvedValue("paused");
    await wrapper.get('[data-test="toggle"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("the play/pause icon reflects isPlaying (no manual sync)", async () => {
    const wrapper = mount(TransportControls, { global: { stubs } });
    const player = usePlayerStore();
    player.isPlaying = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="pause-fill"]').exists()).toBe(true);
    player.isPlaying = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="play-fill"]').exists()).toBe(true);
  });
});
