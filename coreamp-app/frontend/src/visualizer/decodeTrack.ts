export interface EnvelopeSlice {
  rms: number; // normalized 0..1 loudness
  bass: number; // normalized 0..1 low-band energy
}

// Pure: reduce a mono channel into per-window {rms, bass} slices, each
// normalized so the loudest slice across the track is 1.0.
export function extractEnvelope(
  channel: Float32Array,
  sampleRate: number,
  sliceMs = 40,
): EnvelopeSlice[] {
  if (channel.length === 0) return [];
  const win = Math.max(1, Math.floor((sampleRate * sliceMs) / 1000));
  const slices: { rms: number; bass: number }[] = [];

  // Single-pole low-pass to isolate bass energy (~200Hz cutoff).
  const cutoff = 200;
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoff);
  const alpha = dt / (rc + dt);
  let lp = 0;

  for (let start = 0; start < channel.length; start += win) {
    let sumSq = 0;
    let sumBassSq = 0;
    let n = 0;
    for (let i = start; i < start + win && i < channel.length; i++) {
      const x = channel[i];
      lp += alpha * (x - lp);
      sumSq += x * x;
      sumBassSq += lp * lp;
      n++;
    }
    slices.push({
      rms: n ? Math.sqrt(sumSq / n) : 0,
      bass: n ? Math.sqrt(sumBassSq / n) : 0,
    });
  }

  const maxRms = Math.max(1e-9, ...slices.map((s) => s.rms));
  const maxBass = Math.max(1e-9, ...slices.map((s) => s.bass));
  return slices.map((s) => ({ rms: s.rms / maxRms, bass: s.bass / maxBass }));
}

// Decode a track (asset URL) into an AudioBuffer for offline analysis. Uses a
// short-lived AudioContext purely for decoding. Integration-only (Web Audio is
// unavailable under jsdom), so this wrapper is not unit-tested.
export async function decodeTrack(assetUrl: string): Promise<AudioBuffer> {
  const resp = await fetch(assetUrl);
  const bytes = await resp.arrayBuffer();
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();
  try {
    return await ctx.decodeAudioData(bytes);
  } finally {
    void ctx.close();
  }
}
