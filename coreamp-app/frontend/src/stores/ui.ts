import { defineStore } from "pinia";

export type TabName =
  | "home"
  | "library"
  | "liked"
  | "playlists"
  | "audio"
  | "settings";

// Owns the active tab so any view can navigate (e.g. Home drilling into a
// filtered Library).
export const useUiStore = defineStore("ui", {
  state: (): { activeTab: TabName } => ({ activeTab: "home" }),
  actions: {
    setTab(tab: TabName): void {
      this.activeTab = tab;
    },
  },
});
