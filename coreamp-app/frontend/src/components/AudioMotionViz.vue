<template>
  <div ref="hostEl" class="audiomotion-viz" data-test="audiomotion-viz">
    <div v-if="error" class="am-msg small text-light" data-test="audiomotion-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { loadAudioMotion } from "@/visualizer/loadVendor";
import { webDriver } from "@/playback/webDriver";
import { errorMessage } from "@/stores/notify";

// The legacy CoreAmp EQ: AudioMotion-Analyzer driven straight off the shared
// Web Audio graph (no second analyser of our own). It taps the preamp node and
// renders its own canvas; connectSpeakers is off because our graph already
// outputs to the destination.

const hostEl = ref<HTMLDivElement | null>(null);
const error = ref("");
let instance: { destroy?: () => void } | null = null;

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
      mode: 6, // 1/6th-octave bands — the classic EQ spectrum
      showScaleX: false,
      showScaleY: false,
      showBgColor: false,
      overlay: true,
      smoothing: 0.7,
      ledBars: false,
      reflexRatio: 0.25,
      reflexAlpha: 0.18,
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
.am-msg {
  position: absolute;
  left: 0.75rem;
  bottom: 2.5rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
