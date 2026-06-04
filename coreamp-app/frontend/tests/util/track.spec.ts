import { describe, it, expect } from "vitest";
import { toQueueTrack } from "@/util/track";
import type { LibraryTrack } from "@/types";

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
