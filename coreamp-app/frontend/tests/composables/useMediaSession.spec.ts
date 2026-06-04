import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useMediaSession } from "@/composables/useMediaSession";
import type { Track } from "@/types";

type Handler = () => void;

function fakeSession() {
  const handlers = new Map<string, Handler>();
  return {
    metadata: null as unknown,
    playbackState: "none",
    setActionHandler: vi.fn((action: string, cb: Handler) => handlers.set(action, cb)),
    handlers,
  };
}

const track = { path: "/m/a.mp3", title: "Song", artist: "Artist", album: "Album", liked: false } as Track;

describe("useMediaSession", () => {
  let session: ReturnType<typeof fakeSession>;

  beforeEach(() => {
    session = fakeSession();
    vi.stubGlobal("navigator", { mediaSession: session });
    vi.stubGlobal(
      "MediaMetadata",
      class {
        title: string;
        artist: string;
        album: string;
        constructor(init: { title: string; artist: string; album: string }) {
          this.title = init.title;
          this.artist = init.artist;
          this.album = init.album;
        }
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports available when navigator.mediaSession exists", () => {
    expect(useMediaSession().available).toBe(true);
  });

  it("sets metadata from the current track, and clears it for null", () => {
    const m = useMediaSession();
    m.setMetadata(track);
    expect(session.metadata).toMatchObject({ title: "Song", artist: "Artist", album: "Album" });
    m.setMetadata(null);
    expect(session.metadata).toBeNull();
  });

  it("reflects playback state", () => {
    const m = useMediaSession();
    m.setPlaybackState(true);
    expect(session.playbackState).toBe("playing");
    m.setPlaybackState(false);
    expect(session.playbackState).toBe("paused");
  });

  it("routes transport actions to the player", () => {
    const player = {
      togglePlayback: vi.fn(),
      prevTrack: vi.fn(),
      nextTrack: vi.fn(),
    };
    const m = useMediaSession();
    m.bindTransport(player as never);
    session.handlers.get("play")?.();
    session.handlers.get("nexttrack")?.();
    session.handlers.get("previoustrack")?.();
    expect(player.togglePlayback).toHaveBeenCalled();
    expect(player.nextTrack).toHaveBeenCalled();
    expect(player.prevTrack).toHaveBeenCalled();
  });

  it("is a safe no-op when the API is unavailable", () => {
    vi.stubGlobal("navigator", {});
    const m = useMediaSession();
    expect(m.available).toBe(false);
    expect(() => {
      m.setMetadata(track);
      m.setPlaybackState(true);
      m.bindTransport({} as never);
    }).not.toThrow();
  });
});
