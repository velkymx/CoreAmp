<template>
  <div class="visualizer" data-test="visualizer">
    <canvas ref="canvasEl" class="viz-canvas"></canvas>

    <div class="viz-controls d-flex align-items-center gap-2">
      <VibeFormSelect
        v-model="pluginId"
        :options="pluginOptions"
        aria-label="Visualizer mode"
        data-test="viz-plugin"
        class="viz-select"
      />
      <span v-if="!active" class="viz-hint small text-light">
        <template v-if="player.source === 'native'">
          Native output —
          <button type="button" class="viz-link" data-test="viz-use-web" @click="useWeb">
            switch to Web output
          </button>
          to react to audio
        </template>
        <template v-else>Press play to see it move</template>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import { webDriver } from "@/playback/webDriver";
import { usePlayerStore } from "@/stores/player";
import { visualizerPlugins, getPlugin } from "@/visualizer/registry";
import type { VizFrame } from "@/visualizer/types";

const player = usePlayerStore();
const canvasEl = ref<HTMLCanvasElement | null>(null);
const pluginId = ref<FormSelectOptionValue>("bars");
const active = ref(false);

const pluginOptions = computed<FormSelectOption[]>(() =>
  visualizerPlugins.map((p) => ({ value: p.id, text: p.label })),
);

const FFT_BINS = 1024;
const WAVE_LEN = 2048;
const freq = new Uint8Array(FFT_BINS);
const wave = new Uint8Array(WAVE_LEN);
let raf = 0;

function useWeb(): void {
  void player.setSource("web");
}

// Fill the buffers with a gentle idle animation when no live audio is flowing,
// so the canvas is alive rather than blank.
function fillIdle(t: number): void {
  for (let i = 0; i < freq.length; i++) {
    const env = Math.exp(-i / 220);
    freq[i] = Math.max(0, Math.sin(t * 0.002 + i * 0.04) * 40 + 30) * env;
  }
  for (let i = 0; i < wave.length; i++) {
    wave[i] = 128 + Math.sin(t * 0.003 + i * 0.03) * 28;
  }
}

function frameLoop(t: number): void {
  raf = requestAnimationFrame(frameLoop);
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Keep the backing store matched to the displayed size.
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 120;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;

  const analyser = webDriver.getAnalyser();
  const live = Boolean(analyser) && player.isPlaying && player.source === "web";
  active.value = live;
  if (analyser && live) {
    analyser.getByteFrequencyData(freq);
    analyser.getByteTimeDomainData(wave);
  } else {
    fillIdle(t);
  }

  const frame: VizFrame = { freq, wave, t, active: live };
  getPlugin(String(pluginId.value)).draw(ctx, w, h, frame);
}

onMounted(() => {
  if (typeof requestAnimationFrame === "function") {
    raf = requestAnimationFrame(frameLoop);
  }
});
onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
});
</script>

<style scoped>
.visualizer {
  position: relative;
  width: 100%;
  height: 180px;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #0b0f14;
}
.viz-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.viz-controls {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  right: 0.75rem;
}
.viz-select {
  max-width: 11rem;
}
.viz-hint {
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.viz-link {
  border: 0;
  background: transparent;
  color: var(--bs-info, #6edff6);
  text-decoration: underline;
  padding: 0;
  cursor: pointer;
}
</style>
