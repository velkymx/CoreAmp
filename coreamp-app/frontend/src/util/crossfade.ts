// Decide whether the current track is close enough to its end to begin a
// crossfade into the next one. Pure so the timing rule is testable without the
// audio graph.
export function shouldStartCrossfade(
  positionSecs: number,
  durationSecs: number | null,
  crossfadeSecs: number,
  hasNext: boolean,
): boolean {
  if (crossfadeSecs <= 0 || !hasNext) return false;
  if (durationSecs == null || durationSecs <= 0) return false;
  // Don't crossfade tracks shorter than twice the fade (would never play clean).
  if (durationSecs < crossfadeSecs * 2) return false;
  return positionSecs >= durationSecs - crossfadeSecs && positionSecs < durationSecs;
}
