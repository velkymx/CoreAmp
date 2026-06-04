import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import EditMetadataModal from "@/components/EditMetadataModal.vue";
import { useUiStore } from "@/stores/ui";
import * as api from "@/api/tauri";

vi.mock("@/api/tauri", () => ({
  updateTrackMetadataForPath: vi.fn(),
  pickScanPaths: vi.fn().mockResolvedValue(["/img/cover.jpg"]),
  setTrackArtwork: vi.fn().mockResolvedValue(true),
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
  artist: "Old",
  album: "OldAlbum",
  album_artist: null,
  track_number: null,
  title: "OldTitle",
  year: "1999",
  genre: "Rock",
  liked: false,
  rating: 0,
  duration: 100,
};

describe("EditMetadataModal", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("is hidden until a track is opened", () => {
    const w = mount(EditMetadataModal, { global: { stubs } });
    expect(w.find('[data-test="edit-modal"]').exists()).toBe(false);
  });

  it("prefills the form from the opened track", async () => {
    const w = mount(EditMetadataModal, { global: { stubs } });
    useUiStore().openEdit(track);
    await flushPromises();
    expect((w.get('[data-test="edit-title"]').element as HTMLInputElement).value).toBe("OldTitle");
    expect((w.get('[data-test="edit-artist"]').element as HTMLInputElement).value).toBe("Old");
  });

  it("saving sends trimmed fields and bumps data, then closes", async () => {
    vi.mocked(api.updateTrackMetadataForPath).mockResolvedValue({ ...track });
    const w = mount(EditMetadataModal, { global: { stubs } });
    const ui = useUiStore();
    ui.openEdit(track);
    await flushPromises();
    await w.get('[data-test="edit-title"]').setValue("  New Title  ");
    await w.get('[data-test="edit-save"]').trigger("click");
    await flushPromises();
    expect(api.updateTrackMetadataForPath).toHaveBeenCalledWith(
      "/m/a.mp3",
      expect.objectContaining({ title: "New Title" }),
    );
    expect(ui.editTarget).toBeNull();
    expect(ui.dataVersion).toBe(1);
  });

  it("edits and saves the album artist", async () => {
    vi.mocked(api.updateTrackMetadataForPath).mockResolvedValue({ ...track });
    const w = mount(EditMetadataModal, { global: { stubs } });
    useUiStore().openEdit(track);
    await flushPromises();
    await w.get('[data-test="edit-album-artist"]').setValue("Various Artists");
    await w.get('[data-test="edit-save"]').trigger("click");
    await flushPromises();
    expect(api.updateTrackMetadataForPath).toHaveBeenCalledWith(
      "/m/a.mp3",
      expect.objectContaining({ album_artist: "Various Artists" }),
    );
  });

  it("edits and saves the track number as an integer", async () => {
    vi.mocked(api.updateTrackMetadataForPath).mockResolvedValue({ ...track });
    const w = mount(EditMetadataModal, { global: { stubs } });
    useUiStore().openEdit(track);
    await flushPromises();
    await w.get('[data-test="edit-track-number"]').setValue("5");
    await w.get('[data-test="edit-save"]').trigger("click");
    await flushPromises();
    expect(api.updateTrackMetadataForPath).toHaveBeenCalledWith(
      "/m/a.mp3",
      expect.objectContaining({ track_number: 5 }),
    );
  });

  it("replace artwork picks an image and writes it to the track", async () => {
    const w = mount(EditMetadataModal, { global: { stubs } });
    const ui = useUiStore();
    ui.openEdit(track);
    await flushPromises();
    await w.get('[data-test="edit-artwork"]').trigger("click");
    await flushPromises();
    expect(api.pickScanPaths).toHaveBeenCalledWith("image");
    expect(api.setTrackArtwork).toHaveBeenCalledWith("/m/a.mp3", "/img/cover.jpg");
    expect(ui.dataVersion).toBe(1);
  });

  it("cancel closes without saving", async () => {
    const w = mount(EditMetadataModal, { global: { stubs } });
    const ui = useUiStore();
    ui.openEdit(track);
    await flushPromises();
    await w.get('[data-test="edit-cancel"]').trigger("click");
    expect(ui.editTarget).toBeNull();
    expect(api.updateTrackMetadataForPath).not.toHaveBeenCalled();
  });
});
