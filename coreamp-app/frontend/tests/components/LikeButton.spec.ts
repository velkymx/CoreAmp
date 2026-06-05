import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LikeButton from "@/components/LikeButton.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
};

const liked = (v: boolean) => ({
  path: "/m/a.mp3",
  title: "A",
  artist: "X",
  album: "Y",
  liked: v,
});

describe("LikeButton", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("clicking toggles like on the current track", async () => {
    const wrapper = mount(LikeButton, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ queue: [liked(false)], currentIndex: 0 });
    await wrapper.vm.$nextTick();
    const spy = vi.spyOn(player, "toggleLike").mockResolvedValue();
    await wrapper.get('[data-test="like"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("shows a filled heart when the current track is liked", async () => {
    const wrapper = mount(LikeButton, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ queue: [liked(true)], currentIndex: 0 });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="heart-fill"]').exists()).toBe(true);
  });

  it("shows an outline heart when not liked", async () => {
    const wrapper = mount(LikeButton, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ queue: [liked(false)], currentIndex: 0 });
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="heart"]').exists()).toBe(true);
  });
});
