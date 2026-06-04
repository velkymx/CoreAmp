// Convert a decibel value to a linear amplitude multiplier (0 dB = 1.0).
export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

// Linear gain for a ReplayGain value (dB), clamped so a wildly-tagged file can't
// blow out the output. null/undefined means "no ReplayGain" → unity (1.0).
export function replayGainMultiplier(db: number | null | undefined): number {
  if (db == null || !Number.isFinite(db)) return 1;
  const clamped = Math.max(-24, Math.min(24, db));
  return dbToGain(clamped);
}
