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
      search: "daft",
      genre: "Electronic",
      likedOnly: true,
    });
  });

  it("loadTracks sends null search when blank", async () => {
    const lib = useLibraryStore();
    await lib.loadTracks();
    expect(listLibrary).toHaveBeenCalledWith({
      search: null,
      genre: null,
      likedOnly: false,
    });
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

describe("library sorting", () => {
  beforeEach(() => vi.clearAllMocks());

  const rows = () => [
    row({ path: "/m/b.mp3", title: "Beta", artist: "Zed", duration: 300 }),
    row({ path: "/m/a.mp3", title: "Alpha", artist: "Amy", duration: 100 }),
    row({ path: "/m/c.mp3", title: null, filename: "c.mp3", artist: null, duration: null }),
  ];

  it("defaults to backend order until a sort is chosen", () => {
    const lib = useLibraryStore();
    lib.$patch({ tracks: rows() });
    expect(lib.sortedTracks.map((t) => t.path)).toEqual(["/m/b.mp3", "/m/a.mp3", "/m/c.mp3"]);
  });

  it("sorts by title (filename fallback) ascending then descending", () => {
    const lib = useLibraryStore();
    lib.$patch({ tracks: rows() });
    lib.toggleSort("title");
    // null title sorts by filename "c.mp3", so it lands after Alpha/Beta.
    expect(lib.sortedTracks.map((t) => t.title ?? "c.mp3")).toEqual([
      "Alpha",
      "Beta",
      "c.mp3",
    ]);
    lib.toggleSort("title");
    expect(lib.sortDir).toBe("desc");
    expect(lib.sortedTracks.map((t) => t.title ?? "c.mp3")).toEqual([
      "c.mp3",
      "Beta",
      "Alpha",
    ]);
  });

  it("sorts by duration numerically", () => {
    const lib = useLibraryStore();
    lib.$patch({ tracks: rows() });
    lib.toggleSort("duration");
    expect(lib.sortedTracks.map((t) => t.duration)).toEqual([100, 300, null]);
  });
});
