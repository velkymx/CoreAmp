import type { VisualizerPlugin } from "@/visualizer/types";
import { aggregateBars } from "@/visualizer/scale";

const BARS = 48;

// Classic spectrum bars with a yellow→green gradient (Winamp-style).
export const barsPlugin: VisualizerPlugin = {
  id: "bars",
  label: "Bars",
  draw(ctx, w, h, frame) {
    ctx.clearRect(0, 0, w, h);
    const heights = aggregateBars(frame.freq, BARS);
    const gap = 2;
    const barW = (w - gap * (BARS - 1)) / BARS;
    for (let i = 0; i < BARS; i++) {
      const level = heights[i] ?? 0;
      const barH = Math.max(1, level * h);
      const x = i * (barW + gap);
      const y = h - barH;
      const grad = ctx.createLinearGradient(0, h, 0, y);
      grad.addColorStop(0, "#1ed760");
      grad.addColorStop(1, "#f2e205");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, barW, barH);
    }
  },
};
