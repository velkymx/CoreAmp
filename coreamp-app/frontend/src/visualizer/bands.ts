export interface Bands {
  bass: number;
  mid: number;
  treble: number;
}

// Reduce the FFT buffer to three normalized energy bands. Higher bands carry
// less spectral energy, so each gets a gain so the full 0..1 range is usable —
// this is what makes the visualizers/games visibly track the music rather than
// barely twitch on bass alone.
export function extractBands(freq: Uint8Array): Bands {
  const avg = (lo: number, hi: number): number => {
    let sum = 0;
    let n = 0;
    for (let i = lo; i < hi && i < freq.length; i++) {
      sum += freq[i];
      n++;
    }
    return n ? sum / n / 255 : 0;
  };
  return {
    bass: Math.min(1, avg(1, 30) * 1.4),
    mid: Math.min(1, avg(30, 200) * 2.2),
    treble: Math.min(1, avg(200, 520) * 3.2),
  };
}
