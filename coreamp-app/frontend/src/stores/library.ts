import { defineStore } from "pinia";
import type {
  AlbumSummary,
  ArtistSummary,
  GenreSummary,
  LibraryTrack,
} from "@/types";
import * as api from "@/api/tauri";

export type LibraryView = "tracks" | "artists" | "albums" | "genres";

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
  }),
  actions: {
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
      const liked = await api.toggleLiked(path);
      const track = this.tracks.find((t) => t.path === path);
      if (track) track.liked = liked;
      if (this.likedOnly && !liked) {
        this.tracks = this.tracks.filter((t) => t.path !== path);
      }
    },
  },
});
