import type { LibraryTrack, Track } from "@/types";

// Collapse a rich LibraryTrack row down to the minimal queue Track the player
// store works with. Falls back to the file name when a row carries no title.
export function toQueueTrack(row: LibraryTrack): Track {
  return {
    path: row.path,
    title: row.title ?? row.filename,
    artist: row.artist,
    album: row.album,
    liked: row.liked,
  };
}

// "Title — Artist" label for the OS tray / now-playing surfaces. Returns null
// when nothing is playing or the track has no usable text.
export function nowPlayingLabel(track: Track | null): string | null {
  if (!track) return null;
  return [track.title, track.artist].filter(Boolean).join(" — ") || null;
}
