<template>
  <div class="liked-view h-100 overflow-auto">
    <TrackTable
      :tracks="tracks"
      :active-path="player.currentTrack?.path ?? null"
      @play="onPlay"
      @like="onUnlike"
      @play-next="(t) => player.playNext(toQueueTrack(t))"
      @enqueue="(t) => player.enqueue(toQueueTrack(t))"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import type { LibraryTrack } from "@/types";
import * as api from "@/api/tauri";
import TrackTable from "@/components/TrackTable.vue";
import { usePlayerStore } from "@/stores/player";
import { toQueueTrack } from "@/util/track";
import { useNotify } from "@/composables/useNotify";

const player = usePlayerStore();
const { run } = useNotify();
const tracks = ref<LibraryTrack[]>([]);

async function load(): Promise<void> {
  const rows = await run(() => api.listLibrary({ likedOnly: true }), {
    errorPrefix: "Couldn't load liked tracks",
  });
  if (rows) tracks.value = rows;
}
onMounted(load);

function onPlay(index: number): void {
  void player.playTracks(tracks.value.map(toQueueTrack), index);
}

// Unliking from the Liked view removes the row immediately.
async function onUnlike(path: string): Promise<void> {
  const liked = await api.toggleLiked(path);
  if (!liked) tracks.value = tracks.value.filter((t) => t.path !== path);
}

defineExpose({ load });
</script>
