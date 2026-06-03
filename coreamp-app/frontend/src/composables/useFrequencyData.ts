import { shallowRef, ref, triggerRef, onMounted, onBeforeUnmount } from "vue";
import { webDriver } from "@/playback/webDriver";
import { usePlayerStore } from "@/stores/player";

// Single shared analysis loop. One requestAnimationFrame samples the Web Audio
// analyser into reactive buffers that any number of components can consume as
// props — instead of every visual component running its own RAF + analyser read.
const FFT_BINS = 1024;
const WAVE_LEN = 2048;

const freq = shallowRef(new Uint8Array(FFT_BINS));
const wave = shallowRef(new Uint8Array(WAVE_LEN));
const active = ref(false);

let raf = 0;
let consumers = 0;
let player: ReturnType<typeof usePlayerStore> | null = null;

function fillIdle(t: number): void {
  const f = freq.value;
  for (let i = 0; i < f.length; i++) {
    const env = Math.exp(-i / 220);
    f[i] = Math.max(0, Math.sin(t * 0.002 + i * 0.04) * 40 + 30) * env;
  }
  const w = wave.value;
  for (let i = 0; i < w.length; i++) {
    w[i] = 128 + Math.sin(t * 0.003 + i * 0.03) * 28;
  }
}

function tick(t: number): void {
  raf = requestAnimationFrame(tick);
  const analyser = webDriver.getAnalyser();
  const live =
    Boolean(analyser) && Boolean(player?.isPlaying) && player?.source === "web";
  if (analyser && live) {
    analyser.getByteFrequencyData(freq.value);
    analyser.getByteTimeDomainData(wave.value);
  } else {
    fillIdle(t);
  }
  active.value = live;
  triggerRef(freq);
  triggerRef(wave);
}

// Subscribe a component to the shared loop. The loop runs while at least one
// component is mounted.
export function useFrequencyData() {
  if (!player) player = usePlayerStore();
  onMounted(() => {
    if (consumers++ === 0 && typeof requestAnimationFrame === "function") {
      raf = requestAnimationFrame(tick);
    }
  });
  onBeforeUnmount(() => {
    if (--consumers <= 0 && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      consumers = 0;
    }
  });
  return { freq, wave, active };
}
