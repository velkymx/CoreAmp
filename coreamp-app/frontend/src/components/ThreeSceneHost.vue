<template>
  <div ref="hostEl" class="three-scene">
    <div v-if="error" class="ts-msg small text-light" data-test="ts-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { loadThree } from "@/visualizer/loadVendor";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { extractBands } from "@/visualizer/bands";
import { errorMessage } from "@/stores/notify";

// Mounts a three.js scene built from a `create(container, getBands)` factory
// (e.g. createVortex/createStorm), loading three.js from the vendored bundle.
const props = defineProps<{
  create: (
    container: HTMLElement,
    getBands: () => { bass: number; mid: number; treble: number },
  ) => { destroy: () => void };
}>();

const hostEl = ref<HTMLDivElement | null>(null);
const error = ref("");
const { freq } = useFrequencyData();
let scene: { destroy: () => void } | null = null;

onMounted(async () => {
  try {
    const THREE = await loadThree();
    if (!THREE) throw new Error("three.js global not found");
    if (!hostEl.value) return;
    scene = props.create(hostEl.value, () => extractBands(freq.value));
  } catch (err) {
    error.value = `Visualizer unavailable: ${errorMessage(err)}`;
  }
});

onBeforeUnmount(() => {
  scene?.destroy();
  scene = null;
});
</script>

<style scoped>
.three-scene {
  position: absolute;
  inset: 0;
  background: #000;
}
.ts-msg {
  position: absolute;
  left: 0.75rem;
  bottom: 2.5rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
