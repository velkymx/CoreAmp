<template>
  <div ref="hostEl" class="astro-chicken" tabindex="0">
    <div class="ac-hint small text-light">Arrow keys / Space to play</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { createAstroChicken } from "@/visualizer/astroChicken";

const hostEl = ref<HTMLDivElement | null>(null);
const { freq } = useFrequencyData();

let game: { destroy: () => void } | null = null;

// Reduce the FFT buffer to the three bands the game reacts to.
function bands(): { bass: number; mid: number; treble: number } {
  const f = freq.value;
  const avg = (lo: number, hi: number): number => {
    let sum = 0;
    let n = 0;
    for (let i = lo; i < hi && i < f.length; i++) {
      sum += f[i];
      n++;
    }
    return n ? sum / n / 255 : 0;
  };
  return { bass: avg(1, 30), mid: avg(30, 200), treble: avg(200, 500) };
}

onMounted(() => {
  if (!hostEl.value) return;
  hostEl.value.focus();
  game = createAstroChicken(hostEl.value, bands);
});

onBeforeUnmount(() => {
  game?.destroy();
  game = null;
});
</script>

<style scoped>
.astro-chicken {
  position: absolute;
  inset: 0;
  background: #000;
  outline: none;
}
.ac-hint {
  position: absolute;
  left: 0.75rem;
  top: 0.5rem;
  z-index: 2;
  opacity: 0.7;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
</style>
