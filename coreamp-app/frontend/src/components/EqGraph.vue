<template>
  <canvas ref="canvasEl" class="eq-graph w-100 rounded" data-test="eq-graph"></canvas>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import type { EqBand } from "@/types";
import { eqCurveDb, eqFrequencyAxis } from "@/util/eq";
import { aggregateBars } from "@/visualizer/scale";

const props = withDefaults(
  defineProps<{ bands: EqBand[]; freq?: Uint8Array | null }>(),
  { freq: null },
);

const H_DB = 24; // vertical range of the curve, ±dB
const SPECTRUM_BARS = 64;
const axis = eqFrequencyAxis(96);

const canvasEl = ref<HTMLCanvasElement | null>(null);

function draw(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 120;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  ctx.clearRect(0, 0, w, h);

  // Live spectrum behind the curve (faint), fed from the shared analyser data.
  if (props.freq && props.freq.length) {
    const bars = aggregateBars(props.freq, SPECTRUM_BARS);
    const gap = 1;
    const barW = (w - gap * (SPECTRUM_BARS - 1)) / SPECTRUM_BARS;
    ctx.fillStyle = "rgba(110, 168, 254, 0.22)";
    for (let i = 0; i < SPECTRUM_BARS; i++) {
      const barH = Math.max(0, (bars[i] ?? 0) * h);
      ctx.fillRect(i * (barW + gap), h - barH, barW, barH);
    }
  }

  // Zero line.
  ctx.strokeStyle = "rgba(127,127,127,0.4)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // EQ response curve.
  const curve = eqCurveDb(props.bands, axis);
  ctx.strokeStyle = "#0d6efd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * w;
    const clamped = Math.min(Math.max(curve[i], -H_DB), H_DB);
    const y = h / 2 - (clamped / H_DB) * (h / 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

watch(() => props.freq, draw);
watch(() => props.bands, draw, { deep: true });
onMounted(draw);
</script>

<style scoped>
.eq-graph {
  height: 120px;
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.12));
  display: block;
}
</style>
