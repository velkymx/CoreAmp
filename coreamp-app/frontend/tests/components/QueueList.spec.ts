import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import QueueList from "@/components/QueueList.vue";
import { usePlayerStore } from "@/stores/player";

vi.mock("@/api/tauri", () => ({
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  recordPlay: vi.fn().mockResolvedValue(undefined),
  readTrackArtwork: vi.fn().mockResolvedValue(null),
  readTrackSignalDetails: vi.fn().mockResolvedValue(null),
}));

const stubs = {
  VibeButton: {
    props: ["disabled"],
    template: "<button :disabled='disabled'><slot/></button>",
  },
  VibeIcon: { props: ["icon"], template: "<i></i>" },
};

const q = () => [
  { path: "/m/0.mp3", title: "Zero", artist: "X", album: null, liked: false },
  { path: "/m/1.mp3", title: "One", artist: "X", album: null, liked: false },
  { path: "/m/2.mp3", title: "Two", artist: "X", album: null, liked: false },
];

describe("QueueList", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("shows an empty state with no queue", () => {
    const w = mount(QueueList, { global: { stubs } });
    expect(w.find('[data-test="queue-empty"]').exists()).toBe(true);
  });

  it("lists queue rows and marks the current one", async () => {
    const w = mount(QueueList, { global: { stubs } });
    usePlayerStore().$patch({ queue: q(), currentIndex: 1 });
    await w.vm.$nextTick();
    const rows = w.findAll('[data-test="queue-row"]');
    expect(rows).toHaveLength(3);
    expect(rows[1].classes()).toContain("is-current");
  });

  it("removing a row drops it from the queue", async () => {
    const w = mount(QueueList, { global: { stubs } });
    const p = usePlayerStore();
    p.$patch({ queue: q(), currentIndex: 0 });
    await w.vm.$nextTick();
    await w.findAll('[data-test="queue-remove"]')[2].trigger("click");
    expect(p.queue).toHaveLength(2);
  });

  it("moving a row down reorders the queue", async () => {
    const w = mount(QueueList, { global: { stubs } });
    const p = usePlayerStore();
    p.$patch({ queue: q(), currentIndex: 0 });
    await w.vm.$nextTick();
    await w.findAll('[data-test="queue-down"]')[0].trigger("click");
    expect(p.queue[1].path).toBe("/m/0.mp3");
  });

  it("clicking a row jumps playback to it", async () => {
    const w = mount(QueueList, { global: { stubs } });
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, queue: q(), currentIndex: 0 });
    const spy = vi.spyOn(p, "jumpTo");
    await w.vm.$nextTick();
    await w.findAll('[data-test="queue-play"]')[2].trigger("click");
    expect(spy).toHaveBeenCalledWith(2);
  });

  it("stop-after-current toggles the flag", async () => {
    const w = mount(QueueList, { global: { stubs } });
    const p = usePlayerStore();
    await w.get('[data-test="stop-after"]').trigger("click");
    expect(p.stopAfterCurrent).toBe(true);
  });

  it("clear-queue empties the queue", async () => {
    const p = usePlayerStore();
    p.$patch({ queue: [{ path: "/m/a.mp3", title: "A", artist: null, album: null, liked: false }] as never });
    const spy = vi.spyOn(p, "clearQueue").mockResolvedValue();
    const w = mount(QueueList, { global: { stubs } });
    await w.get('[data-test="clear-queue"]').trigger("click");
    expect(spy).toHaveBeenCalled();
  });
});
