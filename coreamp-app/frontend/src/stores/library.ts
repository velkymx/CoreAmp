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

// Tracks are paged so a large library doesn't truncate (the backend caps a
// single query). A full page back means there may be more to load.
const PAGE_SIZE = 200;

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
  // More track pages remain for the current filter.
  hasMore: boolean;
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
    hasMore: false,
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
          limit: PAGE_SIZE,
          offset: 0,
          search: this.search.trim() || null,
          genre: this.genreFilter,
          likedOnly: this.likedOnly,
        });
        if (token !== this.loadToken) return;
        this.tracks = tracks;
        this.hasMore = tracks.length === PAGE_SIZE;
      } catch (err) {
        if (token === this.loadToken) {
          useNotifyStore().error(`Couldn't load library: ${errorMessage(err)}`);
        }
      } finally {
        if (token === this.loadToken) this.loading = false;
      }
    },

    // Append the next page of tracks for the current filter. No-op when nothing
    // more remains or a load is already running. Shares loadToken so changing
    // the filter mid-load discards the stale page.
    async loadMore(): Promise<void> {
      if (!this.hasMore || this.loading) return;
      const token = ++this.loadToken;
      this.loading = true;
      try {
        const page = await api.listLibrary({
          limit: PAGE_SIZE,
          offset: this.tracks.length,
          search: this.search.trim() || null,
          genre: this.genreFilter,
          likedOnly: this.likedOnly,
        });
        if (token !== this.loadToken) return;
        this.tracks = [...this.tracks, ...page];
        this.hasMore = page.length === PAGE_SIZE;
      } catch (err) {
        if (token === this.loadToken) {
          useNotifyStore().error(`Couldn't load more: ${errorMessage(err)}`);
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

    // Set a track's 0–5 star rating, reflecting the clamped stored value.
    async setRating(path: string, rating: number): Promise<void> {
      try {
        const stored = await api.setRating(path, rating);
        const track = this.tracks.find((t) => t.path === path);
        if (track) track.rating = stored;
      } catch (err) {
        useNotifyStore().error(`Couldn't update rating: ${errorMessage(err)}`);
      }
    },
  },
});
