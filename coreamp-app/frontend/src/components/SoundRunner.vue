<template>
  <div ref="hostEl" class="sound-runner" tabindex="0">
    <div v-if="loading" class="sr-msg small text-light" data-test="sr-loading">
      Generating level from {{ songName }}…
    </div>
    <div v-if="note" class="sr-note small text-light">{{ note }}</div>
    <div v-if="gameOver" class="sr-overlay" data-test="sr-gameover">
      <div class="sr-title">GAME OVER</div>
      <div class="sr-score">Score {{ lastScore }}</div>
      <ol class="sr-scores">
        <li v-for="(sc, i) in scores" :key="i">{{ sc.score }} — {{ sc.song }}</li>
      </ol>
      <div class="sr-hint">Press R to play again</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import { usePlayerStore } from "@/stores/player";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { extractBands } from "@/visualizer/bands";
import { decodeTrack, extractEnvelope } from "@/visualizer/decodeTrack";
import { buildLevel, syntheticEnvelope } from "@/visualizer/soundLevel";
import { createSoundRunner } from "@/visualizer/soundRunner";
import { insertScore, loadScores, type Score } from "@/visualizer/highScores";

const player = usePlayerStore();
const { freq } = useFrequencyData();
const hostEl = ref<HTMLDivElement | null>(null);

const loading = ref(false);
const note = ref("");
const gameOver = ref(false);
const lastScore = ref(0);
const scores = ref<Score[]>(loadScores());
const songName = ref("");

let engine: { destroy: () => void } | null = null;

function currentSong(): { path: string | null; name: string } {
  const t = player.currentTrack;
  return { path: t?.path ?? null, name: t?.title ?? "Untitled" };
}

async function buildAndStart(): Promise<void> {
  engine?.destroy();
  engine = null;
  gameOver.value = false;
  note.value = "";
  const { path, name } = currentSong();
  songName.value = name;

  let envelope;
  if (path) {
    loading.value = true;
    try {
      const buffer = await decodeTrack(convertFileSrc(path));
      envelope = extractEnvelope(buffer.getChannelData(0), buffer.sampleRate);
    } catch {
      note.value = "couldn't decode song — random level";
      envelope = syntheticEnvelope();
    } finally {
      loading.value = false;
    }
  } else {
    note.value = "no song loaded — random level";
    envelope = syntheticEnvelope();
  }

  if (!hostEl.value) return;
  const level = buildLevel(envelope);
  engine = createSoundRunner(
    hostEl.value,
    level,
    () => extractBands(freq.value),
    onGameOver,
  );
}

function onGameOver(score: number): void {
  lastScore.value = score;
  scores.value = insertScore({
    score,
    song: songName.value,
    date: new Date().toISOString().slice(0, 10),
  });
  gameOver.value = true;
}

function onKey(e: KeyboardEvent): void {
  if ((e.key === "r" || e.key === "R") && gameOver.value) void buildAndStart();
}

onMounted(() => {
  hostEl.value?.focus();
  window.addEventListener("keydown", onKey);
  void buildAndStart();
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  engine?.destroy();
  engine = null;
});
</script>

<style scoped>
.sound-runner {
  position: absolute;
  inset: 0;
  background: #000;
  outline: none;
}
.sr-msg,
.sr-note {
  position: absolute;
  left: 0.75rem;
  top: 0.5rem;
  z-index: 3;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
.sr-note {
  top: 1.6rem;
  opacity: 0.8;
}
.sr-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  gap: 0.25rem;
}
.sr-title {
  font-size: 1.4rem;
  letter-spacing: 0.1em;
}
.sr-scores {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
  text-align: center;
}
.sr-hint {
  opacity: 0.7;
  margin-top: 0.5rem;
}
</style>
