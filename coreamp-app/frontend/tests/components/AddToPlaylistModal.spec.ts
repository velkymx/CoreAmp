import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AddToPlaylistModal from "@/components/AddToPlaylistModal.vue";
import { useUiStore } from "@/stores/ui";
import * as api from "@/api/tauri";

vi.mock("@/api/tauri", () => ({
  listPlaylists: vi.fn().mockResolvedValue([]),
  appendToPlaylist: vi
    .fn()
    .mockResolvedValue({ name: "A", path: "/p/a.m3u", track_count: 2 }),
  savePlaylist: vi
    .fn()
    .mockResolvedValue({ name: "New", path: "/p/new.m3u", track_count: 1 }),
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
};

const track = {
  path: "/m/a.mp3",
  filename: "a.mp3",
  artist: null,
  album: null,
  album_artist: null,
  track_number: null,
  title: "A",
  year: null,
  genre: null,
  liked: false,
  duration: 100,
};

describe("AddToPlaylistModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads playlists when opened", async () => {
    mount(AddToPlaylistModal, { global: { stubs } });
    useUiStore().openAddToPlaylist(track);
    await flushPromises();
    expect(api.listPlaylists).toHaveBeenCalledOnce();
  });

  it("appends to an existing playlist then closes", async () => {
    vi.mocked(api.listPlaylists).mockResolvedValue([
      { name: "A", path: "/p/a.m3u", track_count: 1 },
    ]);
    const w = mount(AddToPlaylistModal, { global: { stubs } });
    const ui = useUiStore();
    ui.openAddToPlaylist(track);
    await flushPromises();
    await w.get('[data-test="addpl-existing"]').trigger("click");
    await flushPromises();
    expect(api.appendToPlaylist).toHaveBeenCalledWith("/p/a.m3u", ["/m/a.mp3"]);
    expect(ui.playlistTarget).toBeNull();
  });

  it("creating a new playlist saves with the track then closes", async () => {
    const w = mount(AddToPlaylistModal, { global: { stubs } });
    const ui = useUiStore();
    ui.openAddToPlaylist(track);
    await flushPromises();
    await w.get('[data-test="addpl-name"]').setValue("Roadtrip");
    await w.get('[data-test="addpl-create"]').trigger("click");
    await flushPromises();
    expect(api.savePlaylist).toHaveBeenCalledWith("Roadtrip", ["/m/a.mp3"]);
    expect(ui.playlistTarget).toBeNull();
  });
});
