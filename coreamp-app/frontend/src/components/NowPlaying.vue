<template>
  <div class="now-playing d-flex align-items-center gap-2" data-test="now-playing">
    <img
      v-if="art"
      :src="art"
      class="np-art rounded"
      alt="Album artwork"
      data-test="np-art"
    />
    <div
      v-else
      class="np-art np-art--empty rounded d-flex align-items-center justify-content-center text-secondary"
      data-test="np-art-empty"
    >
      <VibeIcon icon="music-note-beamed" />
    </div>
    <div class="np-meta">
      <div class="np-title text-truncate" data-test="np-title">{{ title }}</div>
      <div class="np-artist text-truncate text-secondary small" data-test="np-artist">
        {{ artist }}
      </div>
      <div
        v-if="signalLine"
        class="np-signal text-truncate text-secondary font-monospace"
        data-test="np-signal"
      >
        {{ signalLine }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePlayerStore } from "@/stores/player";
import { artworkUrl, formatSignal } from "@/util/signal";

const player = usePlayerStore();

// Last path segment, used when a track carries no embedded title.
function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

const art = computed(() => artworkUrl(player.artwork));
const signalLine = computed(() => formatSignal(player.signal));

const title = computed(() => {
  const track = player.currentTrack;
  if (!track) return "Nothing playing";
  return track.title || baseName(track.path);
});

const artist = computed(() => {
  const track = player.currentTrack;
  if (!track) return "";
  return track.artist || "Unknown artist";
});
</script>

<style scoped>
.np-art {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  object-fit: cover;
}
.np-art--empty {
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.15));
}
.np-meta {
  min-width: 0;
}
.np-title {
  font-weight: 600;
}
.np-signal {
  font-size: 0.7rem;
  opacity: 0.85;
}
</style>
