import type { EqBand } from "@/types";

const SAMPLE_RATE = 48000;

// Magnitude (in dB) of a single RBJ peaking-EQ biquad at frequency f.
function peakingDbAt(band: EqBand, f: number): number {
  if (band.gain === 0) return 0;
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * band.frequency) / SAMPLE_RATE;
  const cosw0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.max(band.q, 0.0001));

  const b0 = 1 + alpha * A;
  const b1 = -2 * cosw0;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cosw0;
  const a2 = 1 - alpha / A;

  const w = (2 * Math.PI * f) / SAMPLE_RATE;
  const cosw = Math.cos(w);
  const cos2w = Math.cos(2 * w);
  const sinw = Math.sin(w);
  const sin2w = Math.sin(2 * w);

  // |B(e^jw)|^2 and |A(e^jw)|^2 evaluated from the real/imag parts.
  const numRe = b0 + b1 * cosw + b2 * cos2w;
  const numIm = -(b1 * sinw + b2 * sin2w);
  const denRe = a0 + a1 * cosw + a2 * cos2w;
  const denIm = -(a1 * sinw + a2 * sin2w);

  const numMag2 = numRe * numRe + numIm * numIm;
  const denMag2 = denRe * denRe + denIm * denIm;
  return 10 * Math.log10(numMag2 / denMag2);
}

// Log-spaced frequencies spanning the audible band.
export function eqFrequencyAxis(points = 96, fMin = 20, fMax = 20000): number[] {
  const logMin = Math.log10(fMin);
  const logMax = Math.log10(fMax);
  return Array.from({ length: points }, (_, i) =>
    Math.pow(10, logMin + ((logMax - logMin) * i) / (points - 1)),
  );
}

// Combined dB response of the cascaded bands across the given frequencies.
export function eqCurveDb(bands: EqBand[], freqs: number[]): number[] {
  return freqs.map((f) =>
    bands.reduce((sum, band) => sum + peakingDbAt(band, f), 0),
  );
}
