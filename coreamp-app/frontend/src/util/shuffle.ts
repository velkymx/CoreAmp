// Build a shuffled play order for a queue of `length` tracks that begins with
// `currentIndex`, so toggling shuffle never interrupts the current track. The
// remaining indices are drawn from a pool using `rng` (injectable for tests).
export function buildShuffleOrder(
  length: number,
  currentIndex: number,
  rng: () => number = Math.random,
): number[] {
  if (length <= 0) return [];
  const pool: number[] = [];
  for (let i = 0; i < length; i += 1) {
    if (i !== currentIndex) pool.push(i);
  }
  const shuffled: number[] = [];
  while (pool.length > 0) {
    const pick = Math.floor(rng() * pool.length);
    shuffled.push(pool.splice(pick, 1)[0]);
  }
  return currentIndex >= 0 && currentIndex < length
    ? [currentIndex, ...shuffled]
    : shuffled;
}
