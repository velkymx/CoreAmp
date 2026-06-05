import type { Bands } from "@/visualizer/bands";

// Per-frame Y rotation increment for the Orb, driven by the song's energy so
// the blob visibly spins faster during louder/busier passages and idles slowly
// in silence. Bass dominates (it's the felt "speed" of most tracks).
export function orbRotationSpeed(bands: Bands): number {
  const energy = bands.bass * 0.5 + bands.mid * 0.3 + bands.treble * 0.2;
  const IDLE = 0.002;
  const GAIN = 0.03;
  return IDLE + Math.max(0, energy) * GAIN;
}
