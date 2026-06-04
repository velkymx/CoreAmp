import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUiStore } from "@/stores/ui";
import type { LibraryTrack } from "@/types";

const track = { path: "/m/a.mp3", title: "A" } as unknown as LibraryTrack;

describe("ui store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("defaults to the home tab with no modal targets", () => {
    const ui = useUiStore();
    expect(ui.activeTab).toBe("home");
    expect(ui.editTarget).toBeNull();
    expect(ui.playlistTarget).toBeNull();
    expect(ui.detailsTarget).toBeNull();
  });

  it("setTab switches the active tab", () => {
    const ui = useUiStore();
    ui.setTab("library");
    expect(ui.activeTab).toBe("library");
  });

  it("open/close manage each modal target independently", () => {
    const ui = useUiStore();
    ui.openEdit(track);
    ui.openAddToPlaylist(track);
    ui.openDetails(track);
    expect(ui.editTarget).toEqual(track);
    expect(ui.playlistTarget).toEqual(track);
    expect(ui.detailsTarget).toEqual(track);

    ui.closeEdit();
    expect(ui.editTarget).toBeNull();
    expect(ui.playlistTarget).toEqual(track); // unaffected
    ui.closeAddToPlaylist();
    ui.closeDetails();
    expect(ui.playlistTarget).toBeNull();
    expect(ui.detailsTarget).toBeNull();
  });

  it("bumpData increments the data version each call", () => {
    const ui = useUiStore();
    expect(ui.dataVersion).toBe(0);
    ui.bumpData();
    ui.bumpData();
    expect(ui.dataVersion).toBe(2);
  });
});
