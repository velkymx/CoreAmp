import { describe, it, expect, beforeEach, vi } from "vitest";
import { h } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PlaylistsView from "@/components/PlaylistsView.vue";
import { usePlaylistsStore } from "@/stores/playlists";
import { usePlayerStore } from "@/stores/player";
import * as api from "@/api/tauri";

vi.mock("@/api/tauri", () => ({
  listPlaylists: vi.fn().mockResolvedValue([]),
  savePlaylist: vi.fn().mockResolvedValue({ name: "Mix", path: "/p/mix.m3u", track_count: 2 }),
  deletePlaylist: vi.fn().mockResolvedValue(undefined),
  dedupPlaylist: vi.fn().mockResolvedValue({ name: "A", path: "/p/a.m3u", track_count: 1 }),
  appendToPlaylist: vi.fn(),
  importPlaylistFile: vi.fn(),
  loadPlaylist: vi.fn().mockResolvedValue([]),
  recordPlay: vi.fn().mockResolvedValue(undefined),
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  readTrackArtwork: vi.fn().mockResolvedValue(null),
  readTrackSignalDetails: vi.fn().mockResolvedValue(null),
}));

const stubs = {
  VibeFormInput: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  VibeButton: {
    props: ["disabled"],
    template: "<button :disabled='disabled'><slot/></button>",
  },
  VibeIcon: { props: ["icon"], template: "<i></i>" },
  VibeDataTable: {
    props: ["items", "columns"],
    emits: ["row-clicked"],
    setup(props: any, { slots, emit }: any) {
      return () =>
        h(
          "table",
          {},
          props.items.map((item: any, i: number) =>
            h(
              "tr",
              { "data-test": "playlist-row", onClick: () => emit("row-clicked", item, i) },
              props.columns.map((col: any) => {
                const slot = slots[`cell(${col.key})`];
                return h(
                  "td",
                  {},
                  slot ? slot({ item, value: item[col.key], index: i }) : String(item[col.key] ?? ""),
                );
              }),
            ),
          ),
        );
    },
  },
};

const pl = (name: string, path: string) => ({ name, path, track_count: 3 });

describe("PlaylistsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("lists playlists and shows an empty state otherwise", async () => {
    const w = mount(PlaylistsView, { global: { stubs } });
    expect(w.find('[data-test="playlists-empty"]').exists()).toBe(true);
    usePlaylistsStore().$patch({ playlists: [pl("A", "/p/a.m3u")] });
    await w.vm.$nextTick();
    expect(w.findAll('[data-test="playlist-row"]')).toHaveLength(1);
  });

  it("saving the queue is disabled until a name and a queue both exist", async () => {
    const w = mount(PlaylistsView, { global: { stubs } });
    const btn = w.get('[data-test="playlist-save"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    usePlayerStore().$patch({ queue: [{ path: "/m/a.mp3", title: "A", artist: null, album: null, liked: false }] });
    await w.get('[data-test="playlist-name"]').setValue("Mix");
    expect((btn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it("saving sends the queue paths to the store", async () => {
    const w = mount(PlaylistsView, { global: { stubs } });
    usePlayerStore().$patch({
      queue: [{ path: "/m/a.mp3", title: "A", artist: null, album: null, liked: false }],
    });
    await w.get('[data-test="playlist-name"]').setValue("Mix");
    await w.get('[data-test="playlist-save"]').trigger("click");
    expect(api.savePlaylist).toHaveBeenCalledWith("Mix", ["/m/a.mp3"]);
  });

  it("opening a playlist loads it into the queue and plays", async () => {
    vi.mocked(api.loadPlaylist).mockResolvedValue([
      { path: "/m/x.mp3", filename: "x.mp3", artist: null, album: null, album_artist: null, title: "X", year: null, genre: null, liked: false, duration: 100 },
    ]);
    const w = mount(PlaylistsView, { global: { stubs } });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "playTracks").mockResolvedValue();
    usePlaylistsStore().$patch({ playlists: [pl("A", "/p/a.m3u")] });
    await w.vm.$nextTick();
    await w.get('[data-test="playlist-row"]').trigger("click");
    await Promise.resolve();
    expect(api.loadPlaylist).toHaveBeenCalledWith("/p/a.m3u");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("deleting removes the playlist", async () => {
    const w = mount(PlaylistsView, { global: { stubs } });
    usePlaylistsStore().$patch({ playlists: [pl("A", "/p/a.m3u")] });
    await w.vm.$nextTick();
    await w.get('[data-test="playlist-delete"]').trigger("click");
    expect(api.deletePlaylist).toHaveBeenCalledWith("/p/a.m3u");
  });
});
