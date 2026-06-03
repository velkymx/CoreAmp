import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/tauri", () => ({
  listPlaylists: vi.fn().mockResolvedValue([]),
  savePlaylist: vi.fn(),
  appendToPlaylist: vi.fn(),
  deletePlaylist: vi.fn().mockResolvedValue(undefined),
  dedupPlaylist: vi.fn(),
  importPlaylistFile: vi.fn(),
}));

import {
  listPlaylists,
  savePlaylist,
  deletePlaylist,
  dedupPlaylist,
} from "@/api/tauri";
import { usePlaylistsStore } from "@/stores/playlists";

const pl = (name: string, path: string, track_count = 1) => ({
  name,
  path,
  track_count,
});

describe("playlists store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("load fetches the playlist list", async () => {
    vi.mocked(listPlaylists).mockResolvedValue([pl("A", "/p/a.m3u")]);
    const s = usePlaylistsStore();
    await s.load();
    expect(s.playlists).toHaveLength(1);
    expect(s.loading).toBe(false);
  });

  it("save inserts the new playlist sorted by name", async () => {
    const s = usePlaylistsStore();
    s.$patch({ playlists: [pl("Zed", "/p/z.m3u")] });
    vi.mocked(savePlaylist).mockResolvedValue(pl("Alpha", "/p/alpha.m3u", 3));
    await s.save("Alpha", ["/m/a.mp3", "/m/b.mp3"]);
    expect(savePlaylist).toHaveBeenCalledWith("Alpha", ["/m/a.mp3", "/m/b.mp3"]);
    expect(s.playlists.map((p) => p.name)).toEqual(["Alpha", "Zed"]);
  });

  it("save replaces an existing playlist at the same path", async () => {
    const s = usePlaylistsStore();
    s.$patch({ playlists: [pl("Mix", "/p/mix.m3u", 1)] });
    vi.mocked(savePlaylist).mockResolvedValue(pl("Mix", "/p/mix.m3u", 9));
    await s.save("Mix", []);
    expect(s.playlists).toHaveLength(1);
    expect(s.playlists[0].track_count).toBe(9);
  });

  it("remove drops the playlist by path", async () => {
    const s = usePlaylistsStore();
    s.$patch({ playlists: [pl("A", "/p/a.m3u"), pl("B", "/p/b.m3u")] });
    await s.remove("/p/a.m3u");
    expect(deletePlaylist).toHaveBeenCalledWith("/p/a.m3u");
    expect(s.playlists.map((p) => p.path)).toEqual(["/p/b.m3u"]);
  });

  it("dedup updates the playlist track count", async () => {
    const s = usePlaylistsStore();
    s.$patch({ playlists: [pl("A", "/p/a.m3u", 10)] });
    vi.mocked(dedupPlaylist).mockResolvedValue(pl("A", "/p/a.m3u", 7));
    await s.dedup("/p/a.m3u");
    expect(s.playlists[0].track_count).toBe(7);
  });
});
