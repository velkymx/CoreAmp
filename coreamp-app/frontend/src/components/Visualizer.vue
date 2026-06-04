<template>
  <div class="viz-wrap" :class="{ 'is-fullscreen': fullscreen }">
    <div class="visualizer" data-test="visualizer">
    <ThreeOrb v-if="pluginId === 'orb'" />
    <ThreeSceneHost v-else-if="pluginId === 'vortex'" :key="'vortex'" :create="createVortex" />
    <ThreeSceneHost v-else-if="pluginId === 'storm'" :key="'storm'" :create="createStorm" />
    <canvas v-else ref="canvasEl" class="viz-canvas"></canvas>

    <!-- Controls overlay: hidden until you hover the visualizer (or in
         fullscreen) so it never covers the visuals during normal playback. -->
    <div class="viz-controls d-flex align-items-center gap-2">
      <VibeFormSelect
        v-model="pluginId"
        :options="pluginOptions"
        aria-label="Visualizer mode"
        data-test="viz-plugin"
        class="viz-select"
      />
      <button
        type="button"
        class="viz-icon-btn"
        :aria-label="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
        data-test="viz-fullscreen"
        @click="toggleFullscreen"
      >
        {{ fullscreen ? "✕" : "⛶" }}
      </button>
    </div>

    <span v-if="!active" class="viz-hint small text-light">Press play to see it move</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { visualizerPlugins, getPlugin } from "@/visualizer/registry";
import type { VizFrame } from "@/visualizer/types";
import ThreeOrb from "@/components/ThreeOrb.vue";
import ThreeSceneHost from "@/components/ThreeSceneHost.vue";
import { createVortex } from "@/visualizer/vortex";
import { createStorm } from "@/visualizer/storm";

const canvasEl = ref<HTMLCanvasElement | null>(null);
const pluginId = ref<FormSelectOptionValue>("bars");

// Shared analysis data (one RAF for the whole app); redraw whenever it updates.
const { freq, wave, active } = useFrequencyData();

const pluginOptions = computed<FormSelectOption[]>(() => [
  ...visualizerPlugins.map((p) => ({ value: p.id, text: p.label })),
  { value: "orb", text: "Orb (3D)" },
  { value: "vortex", text: "Vortex" },
  { value: "storm", text: "Storm" },
]);

// Pseudo-fullscreen: expand the visualizer to a fixed full-window overlay
// (matches the legacy behavior; reliable inside the webview). Esc exits.
const fullscreen = ref(false);
function toggleFullscreen(): void {
  fullscreen.value = !fullscreen.value;
}
function onKey(e: KeyboardEvent): void {
  if (e.key === "Escape" && fullscreen.value) fullscreen.value = false;
}
onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));

function draw(): void {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.clientWidth || 320;
  const h = canvas.clientHeight || 120;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const frame: VizFrame = {
    freq: freq.value,
    wave: wave.value,
    t: performance.now(),
    active: active.value,
  };
  getPlugin(String(pluginId.value)).draw(ctx, w, h, frame);
}

watch([freq, pluginId], draw);
</script>

<style scoped>
.viz-wrap {
  width: 100%;
}
.visualizer {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 0.5rem;
  overflow: hidden;
  background: #0b0f14;
}
/* Fullscreen: black letterbox backdrop with a centered 16:9 stage. */
.viz-wrap.is-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 1090;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.viz-wrap.is-fullscreen .visualizer {
  width: min(100vw, 177.78vh); /* 16/9 of the viewport height */
  border-radius: 0;
}
.viz-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
.viz-controls {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 5;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}
.visualizer:hover .viz-controls,
.viz-wrap.is-fullscreen .viz-controls {
  opacity: 1;
  pointer-events: auto;
}
.viz-select {
  max-width: 11rem;
}
.viz-icon-btn {
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 0.25rem;
  line-height: 1;
  padding: 0.25rem 0.45rem;
  cursor: pointer;
}
.viz-icon-btn:hover {
  background: rgba(0, 0, 0, 0.7);
}
.viz-hint {
  position: absolute;
  left: 0.75rem;
  bottom: 0.6rem;
  z-index: 4;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.visualizer:hover .viz-hint {
  opacity: 1;
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
