import { defineStore } from "pinia";
import type { LibraryTrack } from "@/types";

export type TabName =
  | "home"
  | "library"
  | "liked"
  | "playlists"
  | "audio"
  | "settings";

interface UiState {
  activeTab: TabName;
  // Track currently open in the edit-metadata modal (null = closed).
  editTarget: LibraryTrack | null;
  // Track currently open in the add-to-playlist modal (null = closed).
  playlistTarget: LibraryTrack | null;
  // Bumped whenever a track's metadata/like changes so views can refresh.
  dataVersion: number;
}

// Owns the active tab and shared modal targets so any view can navigate (e.g.
// Home drilling into a filtered Library) or open a modal over a row.
export const useUiStore = defineStore("ui", {
  state: (): UiState => ({
    activeTab: "home",
    editTarget: null,
    playlistTarget: null,
    dataVersion: 0,
  }),
  actions: {
    setTab(tab: TabName): void {
      this.activeTab = tab;
    },
    openEdit(track: LibraryTrack): void {
      this.editTarget = track;
    },
    closeEdit(): void {
      this.editTarget = null;
    },
    openAddToPlaylist(track: LibraryTrack): void {
      this.playlistTarget = track;
    },
    closeAddToPlaylist(): void {
      this.playlistTarget = null;
    },
    // Signal that library data changed; views watch this to reload.
    bumpData(): void {
      this.dataVersion += 1;
    },
  },
});
