import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/tauri", () => ({
  listLibrary: vi.fn().mockResolvedValue([]),
  libraryCount: vi.fn().mockResolvedValue(0),
  listGenres: vi.fn().mockResolvedValue([]),
  listArtists: vi.fn().mockResolvedValue([]),
  listAlbums: vi.fn().mockResolvedValue([]),
  listGenreSummaries: vi.fn().mockResolvedValue([]),
  toggleLiked: vi.fn().mockResolvedValue(false),
}));

import {
  listLibrary,
  listArtists,
  listAlbums,
  listGenreSummaries,
  toggleLiked,
} from "@/api/tauri";
import { useLibraryStore } from "@/stores/library";
import type { LibraryTrack } from "@/types";

const row = (over = {}) => ({
  path: "/m/a.mp3",
  filename: "a.mp3",
  artist: "X",
  album: "Y",
  album_artist: null,
  track_number: null,
  title: "A",
  year: "2020",
  genre: "Rock",
  liked: false,
  duration: 200,
  ...over,
});

describe("library store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loadTracks maps the current filters into the backend call", async () => {
    const lib = useLibraryStore();
    lib.$patch({ search: "  daft  ", genreFilter: "Electronic", likedOnly: true });
    await lib.loadTracks();
    expect(listLibrary).toHaveBeenCalledWith({
      limit: 200,
      offset: 0,
      search: "daft",
      genre: "Electronic",
      likedOnly: true,
    });
  });

  it("loadTracks sends null search when blank", async () => {
    const lib = useLibraryStore();
    await lib.loadTracks();
    expect(listLibrary).toHaveBeenCalledWith({
      limit: 200,
      offset: 0,
      search: null,
      genre: null,
      likedOnly: false,
    });
  });

  it("flags hasMore when a full page comes back, and pages with loadMore", async () => {
    const lib = useLibraryStore();
    const fullPage = Array.from({ length: 200 }, (_, i) => row({ path: `/m/${i}.mp3` }));
    vi.mocked(listLibrary).mockResolvedValueOnce(fullPage);
    await lib.loadTracks();
    expect(lib.tracks).toHaveLength(200);
    expect(lib.hasMore).toBe(true);

    // Second page is short → no more after it; tracks are appended at the right offset.
    vi.mocked(listLibrary).mockResolvedValueOnce([row({ path: "/m/x.mp3" })]);
    await lib.loadMore();
    expect(listLibrary).toHaveBeenLastCalledWith({
      limit: 200,
      offset: 200,
      search: null,
      genre: null,
      likedOnly: false,
    });
    expect(lib.tracks).toHaveLength(201);
    expect(lib.hasMore).toBe(false);
  });

  it("hasMore stays false (and loadMore no-ops) for a short first page", async () => {
    const lib = useLibraryStore();
    vi.mocked(listLibrary).mockResolvedValueOnce([row()]);
    await lib.loadTracks();
    expect(lib.hasMore).toBe(false);
    vi.mocked(listLibrary).mockClear();
    await lib.loadMore();
    expect(listLibrary).not.toHaveBeenCalled();
  });

  it("setView switches view and loads the matching summary", async () => {
    const lib = useLibraryStore();
    await lib.setView("artists");
    expect(lib.view).toBe("artists");
    expect(listArtists).toHaveBeenCalledOnce();
    await lib.setView("albums");
    expect(listAlbums).toHaveBeenCalledOnce();
    await lib.setView("genres");
    expect(listGenreSummaries).toHaveBeenCalledOnce();
  });

  it("setSearch updates the term and reloads tracks", async () => {
    const lib = useLibraryStore();
    vi.mocked(listLibrary).mockResolvedValue([row()]);
    await lib.setSearch("rock");
    expect(lib.search).toBe("rock");
    expect(lib.tracks).toHaveLength(1);
  });

  it("a stale loadTracks response is discarded when a newer load wins", async () => {
    const lib = useLibraryStore();
    let resolveFirst: (v: LibraryTrack[]) => void = () => {};
    vi.mocked(listLibrary).mockImplementationOnce(
      () => new Promise<LibraryTrack[]>((r) => (resolveFirst = r)),
    );
    const first = lib.loadTracks();
    vi.mocked(listLibrary).mockResolvedValueOnce([row({ title: "NEW" })]);
    await lib.loadTracks();
    resolveFirst([row({ title: "OLD" })]);
    await first;
    expect(lib.tracks[0].title).toBe("NEW");
    expect(lib.loading).toBe(false);
  });
});

describe("library.toggleLike", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flips the liked flag on the matching row", async () => {
    const lib = useLibraryStore();
    lib.$patch({ tracks: [row({ path: "/m/a.mp3", liked: false })] });
    vi.mocked(toggleLiked).mockResolvedValue(true);
    await lib.toggleLike("/m/a.mp3");
    expect(lib.tracks[0].liked).toBe(true);
  });

  it("drops an unliked row from the liked-only view", async () => {
    const lib = useLibraryStore();
    lib.$patch({
      likedOnly: true,
      tracks: [row({ path: "/m/a.mp3", liked: true }), row({ path: "/m/b.mp3" })],
    });
    vi.mocked(toggleLiked).mockResolvedValue(false);
    await lib.toggleLike("/m/a.mp3");
    expect(lib.tracks.map((t) => t.path)).toEqual(["/m/b.mp3"]);
  });
});
