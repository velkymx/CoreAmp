import { defineStore } from "pinia";
import type { PlaylistSummary } from "@/types";
import * as api from "@/api/tauri";
import { useNotifyStore, errorMessage } from "@/stores/notify";

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
      } catch (err) {
        useNotifyStore().error(`Couldn't load playlists: ${errorMessage(err)}`);
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

    async append(playlistPath: string, paths: string[]): Promise<PlaylistSummary> {
      const summary = await api.appendToPlaylist(playlistPath, paths);
      this.upsert(summary);
      return summary;
    },

    async remove(playlistPath: string): Promise<void> {
      try {
        await api.deletePlaylist(playlistPath);
        this.playlists = this.playlists.filter((p) => p.path !== playlistPath);
        useNotifyStore().success("Playlist deleted.");
      } catch (err) {
        useNotifyStore().error(`Couldn't delete playlist: ${errorMessage(err)}`);
      }
    },

    async dedup(playlistPath: string): Promise<void> {
      try {
        const summary = await api.dedupPlaylist(playlistPath);
        this.upsert(summary);
        useNotifyStore().success(`Cleaned up — ${summary.track_count} unique tracks.`);
      } catch (err) {
        useNotifyStore().error(`Couldn't dedup playlist: ${errorMessage(err)}`);
      }
    },

    async importFile(sourcePath: string): Promise<void> {
      const summary = await api.importPlaylistFile(sourcePath);
      this.upsert(summary);
    },

    // Import every .m3u/.m3u8 among dropped file paths, reporting the outcome.
    // Non-playlist files are ignored. Returns the number imported.
    async importDropped(paths: string[]): Promise<number> {
      const notify = useNotifyStore();
      const m3u = paths.filter((p) => /\.m3u8?$/i.test(p));
      if (m3u.length === 0) return 0;
      let imported = 0;
      for (const path of m3u) {
        try {
          await this.importFile(path);
          imported += 1;
        } catch (err) {
          notify.error(`Couldn't import ${path}: ${errorMessage(err)}`);
        }
      }
      if (imported > 0) {
        notify.success(
          `Imported ${imported} playlist${imported === 1 ? "" : "s"}.`,
        );
      }
      return imported;
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
