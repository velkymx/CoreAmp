import type { VisualizerPlugin } from "@/visualizer/types";
import { waveAmplitude } from "@/visualizer/scale";

// Time-domain waveform line — the classic oscilloscope trace.
export const oscilloscopePlugin: VisualizerPlugin = {
  id: "oscilloscope",
  label: "Oscilloscope",
  draw(ctx, w, h, frame) {
    ctx.clearRect(0, 0, w, h);
    const wave = frame.wave;
    if (wave.length === 0) return;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#1ed760";
    ctx.beginPath();
    const step = w / (wave.length - 1);
    for (let i = 0; i < wave.length; i++) {
      const amp = waveAmplitude(wave[i]);
      const x = i * step;
      const y = h / 2 - amp * (h / 2) * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  },
};
