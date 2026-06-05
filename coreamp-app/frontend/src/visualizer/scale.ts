// Group raw FFT frequency bins (0..255 each) into `bars` log-spaced buckets,
// returning a normalized 0..1 height per bar. Log spacing puts more bars in the
// low/mid range where musical energy lives, like a classic graphic spectrum.
export function aggregateBars(freq: Uint8Array, bars: number): number[] {
  if (bars <= 0 || freq.length === 0) return [];
  const out: number[] = [];
  const minBin = 1; // skip DC
  const maxBin = freq.length;
  const logMin = Math.log10(minBin);
  const logMax = Math.log10(maxBin);

  for (let i = 0; i < bars; i++) {
    const lo = Math.floor(
      Math.pow(10, logMin + ((logMax - logMin) * i) / bars),
    );
    const hi = Math.max(
      lo + 1,
      Math.floor(Math.pow(10, logMin + ((logMax - logMin) * (i + 1)) / bars)),
    );
    let sum = 0;
    let count = 0;
    for (let b = lo; b < hi && b < freq.length; b++) {
      sum += freq[b];
      count++;
    }
    out.push(count > 0 ? sum / count / 255 : 0);
  }
  return out;
}

// Convert a 0..255 time-domain (waveform) sample to a -1..1 amplitude.
export function waveAmplitude(sample: number): number {
  return (sample - 128) / 128;
}
