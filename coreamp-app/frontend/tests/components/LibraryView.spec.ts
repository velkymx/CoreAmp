import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import LibraryView from "@/components/LibraryView.vue";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";

vi.mock("@/api/tauri", () => ({
  listLibrary: vi.fn().mockResolvedValue([]),
  listArtists: vi.fn().mockResolvedValue([]),
  listAlbums: vi.fn().mockResolvedValue([]),
  listGenreSummaries: vi.fn().mockResolvedValue([]),
  listGenres: vi.fn().mockResolvedValue([]),
  toggleLiked: vi.fn().mockResolvedValue(false),
  recordPlay: vi.fn().mockResolvedValue(undefined),
  savePlaylist: vi
    .fn()
    .mockResolvedValue({ name: "daft", path: "/p/daft.m3u", track_count: 2 }),
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  readTrackArtwork: vi.fn().mockResolvedValue(null),
  readTrackSignalDetails: vi.fn().mockResolvedValue(null),
}));

const stubs = {
  VibeButtonGroup: { template: "<div><slot/></div>" },
  VibeButton: {
    props: ["variant"],
    template: '<button :data-variant="variant"><slot/></button>',
  },
  VibeFormInput: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  VibeFormSelect: {
    props: ["modelValue", "options"],
    template: "<select></select>",
  },
  VibeIcon: { props: ["icon"], template: "<i></i>" },
  TrackTable: {
    props: ["tracks", "activePath", "searchable"],
    emits: ["play"],
    template:
      '<div><button v-for="t in tracks" :key="t.path" :data-path="t.path" @click="$emit(\'play\', t)"></button></div>',
  },
};

const row = (over = {}) => ({
  path: "/m/a.mp3",
  filename: "a.mp3",
  artist: "X",
  album: "Y",
  album_artist: null,
  track_number: null,
  title: "A",
  year: null,
  genre: null,
  liked: false,
  rating: 0,
  duration: 100,
  ...over,
});

describe("LibraryView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("switching the segmented control loads that view", async () => {
    const w = mount(LibraryView, { global: { stubs } });
    const lib = useLibraryStore();
    const spy = vi.spyOn(lib, "setView");
    await w.get('[data-test="view-artists"]').trigger("click");
    expect(spy).toHaveBeenCalledWith("artists");
  });

  it("clicking a track queues only that track and plays it", async () => {
    const { listLibrary } = await import("@/api/tauri");
    vi.mocked(listLibrary).mockResolvedValue([row(), row({ path: "/m/b.mp3" })]);
    const w = mount(LibraryView, { global: { stubs } });
    const lib = useLibraryStore();
    const player = usePlayerStore();
    lib.$patch({ view: "tracks" });
    await lib.loadTracks();
    const spy = vi.spyOn(player, "playTracks").mockResolvedValue();
    await w.vm.$nextTick();
    await w.find('[data-path="/m/b.mp3"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
    const [queue, index] = spy.mock.calls[0];
    expect(queue).toHaveLength(1);
    expect(queue[0].path).toBe("/m/b.mp3");
    expect(index).toBe(0);
  });

  it("saves the filtered tracks as a playlist named after the search", async () => {
    const { listLibrary, savePlaylist } = await import("@/api/tauri");
    vi.mocked(listLibrary).mockResolvedValue([row(), row({ path: "/m/b.mp3" })]);
    const w = mount(LibraryView, { global: { stubs } });
    const lib = useLibraryStore();
    lib.$patch({ view: "tracks", search: "daft" });
    await lib.loadTracks();
    await w.vm.$nextTick();
    await w.get('[data-test="save-search"]').trigger("click");
    expect(savePlaylist).toHaveBeenCalledWith("daft", ["/m/a.mp3", "/m/b.mp3"]);
  });

  it("hides the save-as-playlist button when no filter is active", async () => {
    const { listLibrary } = await import("@/api/tauri");
    vi.mocked(listLibrary).mockResolvedValue([row()]);
    const w = mount(LibraryView, { global: { stubs } });
    const lib = useLibraryStore();
    lib.$patch({ view: "tracks", search: "" });
    await lib.loadTracks();
    await w.vm.$nextTick();
    expect(w.find('[data-test="save-search"]').exists()).toBe(false);
  });

  it("shows Load more when more pages remain and triggers loadMore", async () => {
    const w = mount(LibraryView, { global: { stubs } });
    const lib = useLibraryStore();
    await flushPromises(); // let onMounted's initial load settle first
    lib.$patch({ view: "tracks", hasMore: true, tracks: [row()] });
    await w.vm.$nextTick();
    const spy = vi.spyOn(lib, "loadMore").mockResolvedValue();
    await w.get('[data-test="library-load-more"]').trigger("click");
    expect(spy).toHaveBeenCalled();
  });

  it("hides Load more when no more pages remain", async () => {
    const w = mount(LibraryView, { global: { stubs } });
    useLibraryStore().$patch({ view: "tracks", hasMore: false, tracks: [row()] });
    await w.vm.$nextTick();
    expect(w.find('[data-test="library-load-more"]').exists()).toBe(false);
  });

  it("typing in the search box drives setSearch", async () => {
    const w = mount(LibraryView, { global: { stubs } });
    const lib = useLibraryStore();
    const spy = vi.spyOn(lib, "setSearch").mockResolvedValue();
    await w.get('[data-test="library-search"]').setValue("daft");
    expect(spy).toHaveBeenCalledWith("daft");
  });
});
