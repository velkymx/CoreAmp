<template>
  <div class="liked-view h-100 overflow-auto">
    <TrackTable
      :tracks="tracks"
      :active-path="player.currentTrack?.path ?? null"
      @play="onPlay"
      @like="onUnlike"
      @play-next="(t) => player.playNext(toQueueTrack(t))"
      @enqueue="(t) => player.enqueue(toQueueTrack(t))"
      @add-to-playlist="(t) => ui.openAddToPlaylist(t)"
      @edit="(t) => ui.openEdit(t)"
      @browse="onBrowse"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import type { LibraryTrack } from "@/types";
import * as api from "@/api/tauri";
import TrackTable from "@/components/TrackTable.vue";
import { usePlayerStore } from "@/stores/player";
import { useUiStore } from "@/stores/ui";
import { useLibraryStore } from "@/stores/library";
import { toQueueTrack } from "@/util/track";
import { useNotify } from "@/composables/useNotify";

const player = usePlayerStore();
const ui = useUiStore();
const library = useLibraryStore();
const { run } = useNotify();
const tracks = ref<LibraryTrack[]>([]);

async function load(): Promise<void> {
  const rows = await run(() => api.listLibrary({ likedOnly: true }), {
    errorPrefix: "Couldn't load liked tracks",
  });
  if (rows) tracks.value = rows;
}
onMounted(load);
watch(() => ui.dataVersion, load);

function onPlay(track: LibraryTrack): void {
  const index = tracks.value.findIndex((t) => t.path === track.path);
  void player.playTracks(tracks.value.map(toQueueTrack), Math.max(index, 0));
}

// Clicking artist/album metadata jumps to a filtered Library view.
async function onBrowse(value: string): Promise<void> {
  library.search = value;
  library.genreFilter = null;
  library.view = "tracks";
  await library.loadTracks();
  ui.setTab("library");
}

// Unliking from the Liked view removes the row immediately.
async function onUnlike(path: string): Promise<void> {
  const liked = await api.toggleLiked(path);
  if (!liked) tracks.value = tracks.value.filter((t) => t.path !== path);
}

defineExpose({ load });
</script>
