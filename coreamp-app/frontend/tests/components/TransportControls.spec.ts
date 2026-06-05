import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TransportControls from "@/components/TransportControls.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
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

  it("clicking shuffle toggles shuffle in the store", async () => {
    const wrapper = mount(TransportControls, {
      global: { stubs: { VibeButton: { template: "<button><slot/></button>" }, VibeIcon: true } },
    });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "toggleShuffle").mockReturnValue();
    await wrapper.get('[data-test="shuffle"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("clicking repeat cycles the repeat mode", async () => {
    const wrapper = mount(TransportControls, {
      global: { stubs: { VibeButton: { template: "<button><slot/></button>" }, VibeIcon: true } },
    });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "cycleRepeat").mockReturnValue();
    await wrapper.get('[data-test="repeat"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("shows the repeat-one icon in track repeat mode", async () => {
    const wrapper = mount(TransportControls, {
      global: {
        stubs: {
          VibeButton: { template: "<button><slot/></button>" },
          VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
        },
      },
    });
    const player = usePlayerStore();
    player.$patch({ repeatMode: "track" });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="repeat-1"]').exists()).toBe(true);
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
