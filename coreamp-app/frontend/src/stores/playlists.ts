import { defineStore } from "pinia";
import type { PlaylistSummary } from "@/types";
import * as api from "@/api/tauri";

interface PlaylistsState {
  playlists: PlaylistSummary[];
  loading: boolean;
}

export const usePlaylistsStore = defineStore("playlists", {
  state: (): PlaylistsState => ({
    playlists: [],
    loading: false,
  }),
  actions: {
    async load(): Promise<void> {
      this.loading = true;
      try {
        this.playlists = await api.listPlaylists();
      } finally {
        this.loading = false;
      }
    },

    // Save a playlist from a set of paths (e.g. the current queue). The returned
    // summary is merged into the list, replacing any same-path entry.
    async save(name: string, paths: string[]): Promise<PlaylistSummary> {
      const summary = await api.savePlaylist(name, paths);
      this.upsert(summary);
      return summary;
    },

    async append(playlistPath: string, paths: string[]): Promise<void> {
      const summary = await api.appendToPlaylist(playlistPath, paths);
      this.upsert(summary);
    },

    async remove(playlistPath: string): Promise<void> {
      await api.deletePlaylist(playlistPath);
      this.playlists = this.playlists.filter((p) => p.path !== playlistPath);
    },

    async dedup(playlistPath: string): Promise<void> {
      const summary = await api.dedupPlaylist(playlistPath);
      this.upsert(summary);
    },

    async importFile(sourcePath: string): Promise<void> {
      const summary = await api.importPlaylistFile(sourcePath);
      this.upsert(summary);
    },

    // Insert or replace a playlist by path, keeping the list sorted by name.
    upsert(summary: PlaylistSummary): void {
      const rest = this.playlists.filter((p) => p.path !== summary.path);
      rest.push(summary);
      rest.sort((a, b) => a.name.localeCompare(b.name));
      this.playlists = rest;
    },
  },
});
