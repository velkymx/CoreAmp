import type { usePlayerStore } from "@/stores/player";

type Player = ReturnType<typeof usePlayerStore>;

const SEEK_STEP = 5; // seconds
const VOL_STEP = 0.05;

// Map a key to a transport action. Returns true if the key was handled.
export function applyShortcut(player: Player, key: string): boolean {
  switch (key) {
    case " ":
      void player.togglePlayback();
      return true;
    case "ArrowRight":
      void player.seek(player.positionSecs + SEEK_STEP);
      return true;
    case "ArrowLeft":
      void player.seek(Math.max(0, player.positionSecs - SEEK_STEP));
      return true;
    case "ArrowUp":
      void player.setVolume(player.volume + VOL_STEP);
      return true;
    case "ArrowDown":
      void player.setVolume(player.volume - VOL_STEP);
      return true;
    case "n":
    case "N":
      void player.nextTrack();
      return true;
    case "p":
    case "P":
      void player.prevTrack();
      return true;
    case "m":
    case "M":
      void player.toggleMute();
      return true;
    case "s":
    case "S":
      player.toggleShuffle();
      return true;
    case "r":
    case "R":
      player.cycleRepeat();
      return true;
    default:
      return false;
  }
}

// Don't steal keys that belong to a form field, contenteditable, or a focused
// visualizer/game (which capture their own keys).
export function shouldIgnoreTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { closest?: (s: string) => unknown }) | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function" && el.closest('[data-test="visualizer"]')) {
    return true;
  }
  return false;
}
