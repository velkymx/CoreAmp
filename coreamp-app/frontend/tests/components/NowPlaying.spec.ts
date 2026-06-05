import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NowPlaying from "@/components/NowPlaying.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
};

const trk = (over = {}) => ({
  path: "/m/song.flac",
  title: "Song",
  artist: "Artist",
  album: "Album",
  liked: false,
  ...over,
});

describe("NowPlaying", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("shows the current track title and artist", async () => {
    const w = mount(NowPlaying, { global: { stubs } });
    usePlayerStore().$patch({ queue: [trk()], currentIndex: 0 });
    await w.vm.$nextTick();
    expect(w.get('[data-test="np-title"]').text()).toBe("Song");
    expect(w.get('[data-test="np-artist"]').text()).toBe("Artist");
  });

  it("falls back to the file name when the title is missing", async () => {
    const w = mount(NowPlaying, { global: { stubs } });
    usePlayerStore().$patch({ queue: [trk({ title: null })], currentIndex: 0 });
    await w.vm.$nextTick();
    expect(w.get('[data-test="np-title"]').text()).toBe("song.flac");
  });

  it("renders embedded artwork as an image when present", async () => {
    const w = mount(NowPlaying, { global: { stubs } });
    usePlayerStore().$patch({
      queue: [trk()],
      currentIndex: 0,
      artwork: { mime_type: "image/jpeg", data_base64: "AAAA" },
    });
    await w.vm.$nextTick();
    expect(w.get('[data-test="np-art"]').attributes("src")).toBe(
      "data:image/jpeg;base64,AAAA",
    );
  });

  it("shows a placeholder icon when no artwork is available", async () => {
    const w = mount(NowPlaying, { global: { stubs } });
    usePlayerStore().$patch({ queue: [trk()], currentIndex: 0, artwork: null });
    await w.vm.$nextTick();
    expect(w.find('[data-test="np-art"]').exists()).toBe(false);
    expect(w.find('[data-test="np-art-empty"]').exists()).toBe(true);
  });

  it("renders a formatted signal line when details are loaded", async () => {
    const w = mount(NowPlaying, { global: { stubs } });
    usePlayerStore().$patch({
      queue: [trk()],
      currentIndex: 0,
      signal: {
        format: "FLAC",
        sample_rate_hz: 44100,
        bit_depth: 16,
        channels: 2,
        bitrate_kbps: 1411,
      },
    });
    await w.vm.$nextTick();
    expect(w.get('[data-test="np-signal"]').text()).toBe(
      "FLAC · 44.1 kHz · 16-bit · Stereo · 1411 kbps",
    );
  });

  it("shows a resting label when nothing is playing", () => {
    const w = mount(NowPlaying, { global: { stubs } });
    expect(w.get('[data-test="np-title"]').text()).toBe("Nothing playing");
    expect(w.find('[data-test="np-signal"]').exists()).toBe(false);
  });
});
