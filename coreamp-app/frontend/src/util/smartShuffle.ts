// Lightweight "smart shuffle": instead of a uniform random order, bias the
// queue toward tracks similar to the seed (same artist / same album) using the
// metadata already on each queue entry. A small random jitter keeps repeats
// varied and prevents a strict, predictable ordering. No model, no network.

export interface ShuffleTrack {
  artist: string | null;
  album: string | null;
}

// Higher = more similar to the seed.
export function trackSimilarity(seed: ShuffleTrack, other: ShuffleTrack): number {
  let score = 0;
  if (seed.artist && other.artist && seed.artist === other.artist) score += 3;
  if (seed.album && other.album && seed.album === other.album) score += 2;
  return score;
}

// Returns a play order (indices) with `seedIndex` first, the rest sorted by
// similarity-to-seed plus jitter (descending). `rng` is injectable for tests.
export function smartShuffleOrder(
  tracks: ShuffleTrack[],
  seedIndex: number,
  rng: () => number = Math.random,
): number[] {
  if (tracks.length === 0) return [];
  const seed = tracks[Math.max(0, Math.min(seedIndex, tracks.length - 1))];
  const others = tracks
    .map((_, i) => i)
    .filter((i) => i !== seedIndex)
    .map((i) => ({ i, key: trackSimilarity(seed, tracks[i]) + rng() * 1.5 }));
  others.sort((a, b) => b.key - a.key);
  return [seedIndex, ...others.map((o) => o.i)];
}
