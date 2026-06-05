<template>
  <div ref="hostEl" class="audiomotion-viz" data-test="audiomotion-viz">
    <select
      v-model="mode"
      class="am-mode"
      aria-label="EQ display mode"
      data-test="audiomotion-mode"
      @change="applyMode"
    >
      <option v-for="m in AUDIOMOTION_MODES" :key="m.value" :value="m.value">{{ m.text }}</option>
    </select>
    <div v-if="error" class="am-msg small text-light" data-test="audiomotion-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { loadAudioMotion } from "@/visualizer/loadVendor";
import { webDriver } from "@/playback/webDriver";
import { errorMessage } from "@/stores/notify";
import {
  AUDIOMOTION_MODES,
  audioMotionOptions,
  loadAudioMotionMode,
  persistAudioMotionMode,
  type AudioMotionMode,
} from "@/visualizer/audioMotionModes";

// The legacy CoreAmp EQ: AudioMotion-Analyzer driven straight off the shared
// Web Audio graph (no second analyser of our own). It taps the preamp node and
// renders its own canvas; connectSpeakers is off because our graph already
// outputs to the destination. A small overlay select switches the bar style.

const hostEl = ref<HTMLDivElement | null>(null);
const error = ref("");
const mode = ref<AudioMotionMode>(loadAudioMotionMode());
let instance: { destroy?: () => void; setOptions?: (o: object) => void } | null = null;

// Apply the selected display mode to the live instance and persist it.
function applyMode(): void {
  persistAudioMotionMode(mode.value);
  instance?.setOptions?.(audioMotionOptions(mode.value));
}

onMounted(async () => {
  try {
    // Make sure the audio graph (context + source node) exists before tapping.
    webDriver.ensureGraph?.();
    const ctx = webDriver.getAudioContext?.();
    const source = webDriver.getVizSource?.();
    if (!ctx || !source) {
      error.value = "Audio engine not ready.";
      return;
    }
    const AudioMotionAnalyzer = await loadAudioMotion();
    if (!AudioMotionAnalyzer) throw new Error("AudioMotion-Analyzer global not found");
    if (!hostEl.value) return;

    instance = new AudioMotionAnalyzer(hostEl.value, {
      audioCtx: ctx,
      source,
      connectSpeakers: false,
      gradient: "prism",
      showScaleX: false,
      showScaleY: false,
      showBgColor: false,
      overlay: true,
      smoothing: 0.7,
      reflexAlpha: 0.18,
      ...audioMotionOptions(mode.value),
    });
  } catch (err) {
    error.value = `EQ unavailable: ${errorMessage(err)}`;
  }
});

onBeforeUnmount(() => {
  try {
    instance?.destroy?.();
  } catch {
    /* ignore teardown errors */
  }
  instance = null;
});
</script>

<style scoped>
.audiomotion-viz {
  position: absolute;
  inset: 0;
  background: #000;
}
.audiomotion-viz :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
/* Mode picker: hidden until the visualizer is hovered (matches the other
   visualizer controls). */
.am-mode {
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  z-index: 6;
  opacity: 0;
  transition: opacity 0.15s ease;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  border: 0;
  border-radius: 0.25rem;
  font-size: 0.8rem;
  padding: 0.15rem 0.35rem;
}
.audiomotion-viz:hover .am-mode {
  opacity: 1;
}
.am-msg {
  position: absolute;
  left: 0.75rem;
  bottom: 2.5rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
