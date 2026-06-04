import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TrackDetailsModal from "@/components/TrackDetailsModal.vue";
import { useUiStore } from "@/stores/ui";
import { usePlayerStore } from "@/stores/player";
import * as api from "@/api/tauri";

vi.mock("@/api/tauri", () => ({
  listAlbumTracks: vi.fn().mockResolvedValue([]),
}));

const stubs = {
  AlbumArt: { props: ["path", "size"], template: "<div class='art' />" },
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["icon"], template: "<i />" },
};

const track = {
  path: "/m/01.mp3",
  filename: "01.mp3",
  artist: "Aurora",
  album: "Skyline",
  album_artist: "Aurora",
  track_number: null,
  title: "Track One",
  year: "2021",
  genre: "Synthwave",
  liked: false,
  duration: 200,
};

const albumRows = [
  { ...track },
  {
    path: "/m/02.mp3",
    filename: "02.mp3",
    artist: "Aurora",
    album: "Skyline",
    album_artist: "Aurora",
    track_number: null,
    title: "Track Two",
    year: "2021",
    genre: "Synthwave",
    liked: false,
    duration: 180,
  },
];

describe("TrackDetailsModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(api.listAlbumTracks).mockResolvedValue(albumRows);
  });

  it("loads the album tracklist scoped to the track's artist when opened", async () => {
    mount(TrackDetailsModal, { global: { stubs } });
    useUiStore().openDetails(track);
    await flushPromises();
    expect(api.listAlbumTracks).toHaveBeenCalledWith("Skyline", "Aurora");
  });

  it("renders the album tracks and plays the album from the clicked track", async () => {
    const w = mount(TrackDetailsModal, { global: { stubs } });
    const player = usePlayerStore();
    const playSpy = vi.spyOn(player, "playTracks").mockResolvedValue(undefined);
    useUiStore().openDetails(track);
    await flushPromises();

    const rows = w.findAll('[data-test="details-album-track"]');
    expect(rows).toHaveLength(2);

    await rows[1].trigger("click");
    expect(playSpy).toHaveBeenCalledTimes(1);
    const [queue, index] = playSpy.mock.calls[0];
    expect(queue).toHaveLength(2);
    expect((queue as { path: string }[])[1].path).toBe("/m/02.mp3");
    expect(index).toBe(1);
  });

  it("closes via the close button", async () => {
    const w = mount(TrackDetailsModal, { global: { stubs } });
    const ui = useUiStore();
    ui.openDetails(track);
    await flushPromises();
    await w.get('[data-test="details-close"]').trigger("click");
    expect(ui.detailsTarget).toBeNull();
  });
});
