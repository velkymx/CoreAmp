<template>
  <div ref="hostEl" class="butterchurn-host">
    <canvas ref="canvasEl" class="butterchurn-canvas"></canvas>
    <div v-if="error" class="bc-msg small text-light" data-test="bc-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { webDriver } from "@/playback/webDriver";
import { loadButterchurn } from "@/visualizer/loadVendor";

const hostEl = ref<HTMLDivElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const error = ref("");

let visualizer: any = null;
let raf = 0;
let resizeObs: ResizeObserver | null = null;

function size(): { w: number; h: number } {
  const host = hostEl.value;
  return { w: host?.clientWidth || 320, h: host?.clientHeight || 180 };
}

function render(): void {
  raf = requestAnimationFrame(render);
  visualizer?.render();
}

onMounted(async () => {
  try {
    // Make sure the audio graph (and AudioContext) exists to attach to.
    webDriver.ensureGraph();
    const ctx = webDriver.getAudioContext();
    const sourceNode = webDriver.getVizSource();
    const canvas = canvasEl.value;
    if (!ctx || !sourceNode || !canvas) {
      error.value = "Visualizer needs Web Audio (play a track to start).";
      return;
    }

    const { butterchurn, presets } = await loadButterchurn();
    const { w, h } = size();
    visualizer = butterchurn.createVisualizer(ctx, canvas, {
      width: w,
      height: h,
      pixelRatio: window.devicePixelRatio || 1,
    });
    visualizer.connectAudio(sourceNode);

    const names = Object.keys(presets);
    if (names.length) {
      const pick = names[Math.floor(Math.random() * names.length)];
      visualizer.loadPreset(presets[pick], 0);
    }

    resizeObs = new ResizeObserver(() => {
      const s = size();
      visualizer?.setRendererSize(s.w, s.h);
    });
    if (hostEl.value) resizeObs.observe(hostEl.value);

    raf = requestAnimationFrame(render);
  } catch (err) {
    error.value = `Milkdrop unavailable: ${String(err)}`;
  }
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  resizeObs?.disconnect();
  visualizer = null;
});
</script>

<style scoped>
.butterchurn-host {
  position: absolute;
  inset: 0;
}
.butterchurn-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.bc-msg {
  position: absolute;
  left: 0.75rem;
  bottom: 2.5rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
