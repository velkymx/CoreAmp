import { defineStore } from "pinia";
import type {
  AlbumSummary,
  ArtistSummary,
  GenreSummary,
  LibraryTrack,
} from "@/types";
import * as api from "@/api/tauri";
import { useNotifyStore, errorMessage } from "@/stores/notify";

export type LibraryView = "tracks" | "artists" | "albums" | "genres";
export type SortKey = "title" | "artist" | "album" | "duration";
export type SortDir = "asc" | "desc";

// Value used for sorting a row by a given column (title falls back to filename).
function sortValue(track: LibraryTrack, key: SortKey): string | number | null {
  if (key === "title") return track.title || track.filename;
  if (key === "duration") return track.duration;
  return track[key];
}

interface LibraryState {
  view: LibraryView;
  tracks: LibraryTrack[];
  artists: ArtistSummary[];
  albums: AlbumSummary[];
  genreSummaries: GenreSummary[];
  genreOptions: string[];
  search: string;
  genreFilter: string | null;
  likedOnly: boolean;
  count: number;
  loading: boolean;
  loadToken: number;
  sortKey: SortKey | null;
  sortDir: SortDir;
}

export const useLibraryStore = defineStore("library", {
  state: (): LibraryState => ({
    view: "tracks",
    tracks: [],
    artists: [],
    albums: [],
    genreSummaries: [],
    genreOptions: [],
    search: "",
    genreFilter: null,
    likedOnly: false,
    count: 0,
    loading: false,
    loadToken: 0,
    sortKey: null,
    sortDir: "asc",
  }),
  getters: {
    // Tracks ordered by the active sort column. Empty/null values always sort
    // last; default (no sort key) preserves backend order.
    sortedTracks(state): LibraryTrack[] {
      if (!state.sortKey) return state.tracks;
      const key = state.sortKey;
      const dir = state.sortDir === "asc" ? 1 : -1;
      return [...state.tracks].sort((a, b) => {
        const av = sortValue(a, key);
        const bv = sortValue(b, key);
        const aEmpty = av == null || av === "";
        const bEmpty = bv == null || bv === "";
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (key === "duration") return ((av as number) - (bv as number)) * dir;
        return (
          String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) *
          dir
        );
      });
    },
  },
  actions: {
    // Toggle sorting on a column: same column flips direction, a new column
    // starts ascending.
    toggleSort(key: SortKey): void {
      if (this.sortKey === key) {
        this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
      } else {
        this.sortKey = key;
        this.sortDir = "asc";
      }
    },

    // Load tracks honoring the current search / genre / liked filters. Token-
    // guarded so a stale response from a superseded filter can't overwrite a
    // newer one.
    async loadTracks(): Promise<void> {
      const token = ++this.loadToken;
      this.loading = true;
      try {
        const tracks = await api.listLibrary({
          search: this.search.trim() || null,
          genre: this.genreFilter,
          likedOnly: this.likedOnly,
        });
        if (token !== this.loadToken) return;
        this.tracks = tracks;
      } catch (err) {
        if (token === this.loadToken) {
          useNotifyStore().error(`Couldn't load library: ${errorMessage(err)}`);
        }
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },

    async loadArtists(): Promise<void> {
      this.artists = await api.listArtists();
    },
    async loadAlbums(): Promise<void> {
      this.albums = await api.listAlbums();
    },
    async loadGenreSummaries(): Promise<void> {
      this.genreSummaries = await api.listGenreSummaries();
    },
    async loadGenreOptions(): Promise<void> {
      this.genreOptions = await api.listGenres();
    },
    async loadCount(): Promise<void> {
      this.count = await api.libraryCount();
    },

    // Load whatever the active view needs.
    async refresh(): Promise<void> {
      if (this.view === "tracks") return this.loadTracks();
      if (this.view === "artists") return this.loadArtists();
      if (this.view === "albums") return this.loadAlbums();
      return this.loadGenreSummaries();
    },

    async setView(view: LibraryView): Promise<void> {
      this.view = view;
      await this.refresh();
    },

    async setSearch(search: string): Promise<void> {
      this.search = search;
      await this.loadTracks();
    },

    async setGenreFilter(genre: string | null): Promise<void> {
      this.genreFilter = genre;
      await this.loadTracks();
    },

    async setLikedOnly(likedOnly: boolean): Promise<void> {
      this.likedOnly = likedOnly;
      await this.loadTracks();
    },

    // Toggle the like flag on a library row and reflect the new value in place.
    // When viewing the liked-only filter, an unliked row is dropped from view.
    async toggleLike(path: string): Promise<void> {
      try {
        const liked = await api.toggleLiked(path);
        const track = this.tracks.find((t) => t.path === path);
        if (track) track.liked = liked;
        if (this.likedOnly && !liked) {
          this.tracks = this.tracks.filter((t) => t.path !== path);
        }
      } catch (err) {
        useNotifyStore().error(`Couldn't update like: ${errorMessage(err)}`);
      }
    },
  },
});
