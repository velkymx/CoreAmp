import type { Track } from "@/types";
import type { usePlayerStore } from "@/stores/player";

type Player = ReturnType<typeof usePlayerStore>;

// Bridges playback to the OS via the Web Media Session API. In the macOS
// WKWebView this surfaces the track in the system "Now Playing" widget and lets
// the keyboard media keys (play/pause, prev, next) drive the player. No native
// code required; a harmless no-op where the API is unavailable (tests, older
// webviews).
export function useMediaSession() {
  const ms: MediaSession | undefined =
    typeof navigator !== "undefined" ? navigator.mediaSession : undefined;

  function setActionHandler(action: MediaSessionAction, handler: () => void): void {
    try {
      ms?.setActionHandler(action, handler);
    } catch {
      // Some actions aren't supported on every platform.
    }
  }

  // Route the system transport controls to the player's transport actions.
  function bindTransport(player: Player): void {
    if (!ms) return;
    setActionHandler("play", () => void player.togglePlayback());
    setActionHandler("pause", () => void player.togglePlayback());
    setActionHandler("previoustrack", () => void player.prevTrack());
    setActionHandler("nexttrack", () => void player.nextTrack());
  }

  function setMetadata(track: Track | null): void {
    if (!ms) return;
    if (!track || typeof MediaMetadata === "undefined") {
      ms.metadata = null;
      return;
    }
    ms.metadata = new MediaMetadata({
      title: track.title ?? "",
      artist: track.artist ?? "",
      album: track.album ?? "",
    });
  }

  function setPlaybackState(isPlaying: boolean): void {
    if (!ms) return;
    ms.playbackState = isPlaying ? "playing" : "paused";
  }

  return { available: Boolean(ms), bindTransport, setMetadata, setPlaybackState };
}
