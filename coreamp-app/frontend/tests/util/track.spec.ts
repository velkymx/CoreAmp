import { describe, it, expect } from "vitest";
import { toQueueTrack, nowPlayingLabel } from "@/util/track";
import type { LibraryTrack, Track } from "@/types";

function libraryRow(over: Partial<LibraryTrack> = {}): LibraryTrack {
  return {
    path: "/m/a.mp3",
    filename: "a.mp3",
    artist: "Aurora",
    album: "Skyline",
    album_artist: "Aurora",
    title: "Track One",
    year: "2021",
    genre: "Synthwave",
    track_number: 1,
    liked: true,
    rating: 0,
    duration: 200,
    ...over,
  };
}

describe("toQueueTrack", () => {
  it("maps the minimal queue fields from a library row", () => {
    expect(toQueueTrack(libraryRow())).toEqual({
      path: "/m/a.mp3",
      title: "Track One",
      artist: "Aurora",
      album: "Skyline",
      liked: true,
    });
  });

  it("falls back to the filename when the row has no title", () => {
    expect(toQueueTrack(libraryRow({ title: null })).title).toBe("a.mp3");
  });

  it("preserves null artist/album and the liked flag", () => {
    const t = toQueueTrack(libraryRow({ artist: null, album: null, liked: false }));
    expect(t.artist).toBeNull();
    expect(t.album).toBeNull();
    expect(t.liked).toBe(false);
  });

  it("drops the rich-only fields (year/genre/track_number/duration)", () => {
    const t = toQueueTrack(libraryRow()) as unknown as Record<string, unknown>;
    expect(t).not.toHaveProperty("year");
    expect(t).not.toHaveProperty("genre");
    expect(t).not.toHaveProperty("track_number");
    expect(t).not.toHaveProperty("duration");
  });
});

describe("nowPlayingLabel", () => {
  const t = (over: Partial<Track> = {}): Track =>
    ({ path: "/m/a.mp3", title: "Song", artist: "Artist", album: null, liked: false, ...over });

  it("returns null when nothing is playing", () => {
    expect(nowPlayingLabel(null)).toBeNull();
  });

  it("joins title and artist with an em dash", () => {
    expect(nowPlayingLabel(t())).toBe("Song — Artist");
  });

  it("uses just the title when there is no artist", () => {
    expect(nowPlayingLabel(t({ artist: null }))).toBe("Song");
  });

  it("returns null when the track has no usable text", () => {
    expect(nowPlayingLabel(t({ title: null, artist: null }))).toBeNull();
  });
});
