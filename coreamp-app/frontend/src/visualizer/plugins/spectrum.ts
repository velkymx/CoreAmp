import type { VisualizerPlugin } from "@/visualizer/types";
import { aggregateBars } from "@/visualizer/scale";

const BARS = 64;
const PEAK_FALL = 0.012; // how fast the peak caps drift back down per frame

// Spectrum bars with falling peak-hold caps. Keeps a small amount of internal
// state (the cap positions) between frames.
function createSpectrum(): VisualizerPlugin {
  const peaks = new Array<number>(BARS).fill(0);
  return {
    id: "spectrum",
    label: "Spectrum",
    draw(ctx, w, h, frame) {
      ctx.clearRect(0, 0, w, h);
      const heights = aggregateBars(frame.freq, BARS);
      const gap = 1;
      const barW = (w - gap * (BARS - 1)) / BARS;
      for (let i = 0; i < BARS; i++) {
        const level = heights[i] ?? 0;
        peaks[i] = level > peaks[i] ? level : Math.max(0, peaks[i] - PEAK_FALL);
        const x = i * (barW + gap);
        const barH = Math.max(1, level * h);
        const hue = 200 - level * 160; // blue (low) → red (hot)
        ctx.fillStyle = `hsl(${hue}, 90%, 55%)`;
        ctx.fillRect(x, h - barH, barW, barH);
        // peak cap
        const capY = h - Math.max(1, peaks[i] * h);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(x, capY, barW, 2);
      }
    },
  };
}

export const spectrumPlugin = createSpectrum();
