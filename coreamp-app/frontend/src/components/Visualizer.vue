<template>
  <div class="visualizer" data-test="visualizer">
    <ThreeOrb v-if="pluginId === 'orb'" />
    <AstroChicken v-else-if="pluginId === 'game'" />
    <canvas v-else ref="canvasEl" class="viz-canvas"></canvas>

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
import { ref, computed, watch } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import { usePlayerStore } from "@/stores/player";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { visualizerPlugins, getPlugin } from "@/visualizer/registry";
import type { VizFrame } from "@/visualizer/types";
import ThreeOrb from "@/components/ThreeOrb.vue";
import AstroChicken from "@/components/AstroChicken.vue";

const player = usePlayerStore();
const canvasEl = ref<HTMLCanvasElement | null>(null);
const pluginId = ref<FormSelectOptionValue>("bars");

// Shared analysis data (one RAF for the whole app); redraw whenever it updates.
const { freq, wave, active } = useFrequencyData();

const pluginOptions = computed<FormSelectOption[]>(() => [
  ...visualizerPlugins.map((p) => ({ value: p.id, text: p.label })),
  { value: "orb", text: "Orb (3D)" },
  { value: "game", text: "Astro Chicken" },
]);

function useWeb(): void {
  void player.setSource("web");
}

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
