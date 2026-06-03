<template>
  <div class="playlists-view h-100 d-flex">
    <div class="playlists-pane flex-grow-1 d-flex flex-column">
    <div class="playlists-toolbar d-flex gap-2 p-2 align-items-center border-bottom">
      <VibeFormInput
        v-model="newName"
        placeholder="New playlist name"
        aria-label="New playlist name"
        data-test="playlist-name"
        class="flex-grow-1"
      />
      <VibeButton
        variant="primary"
        :disabled="!canSave"
        data-test="playlist-save"
        @click="onSave"
      >
        Save current queue
      </VibeButton>
    </div>

    <div class="playlists-list flex-grow-1 overflow-auto">
      <div
        v-if="playlists.playlists.length === 0"
        class="p-4 text-center text-secondary"
        data-test="playlists-empty"
      >
        No playlists yet
      </div>
      <ul v-else class="list-group list-group-flush">
        <li
          v-for="p in playlists.playlists"
          :key="p.path"
          class="list-group-item d-flex align-items-center gap-2"
          data-test="playlist-row"
        >
          <button
            type="button"
            class="btn btn-link text-start flex-grow-1 text-decoration-none p-0"
            data-test="playlist-open"
            @click="onOpen(p)"
          >
            <span class="fw-semibold">{{ p.name }}</span>
            <span class="text-secondary small ms-2">{{ p.track_count }} tracks</span>
          </button>
          <VibeButton
            variant="secondary"
            outline
            size="sm"
            aria-label="Remove duplicates"
            data-test="playlist-dedup"
            @click="playlists.dedup(p.path)"
          >
            <VibeIcon icon="funnel" />
          </VibeButton>
          <VibeButton
            variant="danger"
            outline
            size="sm"
            aria-label="Delete playlist"
            data-test="playlist-delete"
            @click="playlists.remove(p.path)"
          >
            <VibeIcon icon="trash" />
          </VibeButton>
        </li>
      </ul>
    </div>
    </div>
    <aside class="queue-pane border-start"><QueueList /></aside>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { PlaylistSummary } from "@/types";
import * as api from "@/api/tauri";
import { usePlaylistsStore } from "@/stores/playlists";
import { usePlayerStore } from "@/stores/player";
import { toQueueTrack } from "@/util/track";
import QueueList from "@/components/QueueList.vue";
import { useNotify } from "@/composables/useNotify";

const playlists = usePlaylistsStore();
const player = usePlayerStore();
const { run } = useNotify();
const newName = ref("");

onMounted(() => void playlists.load());

const canSave = computed(
  () => newName.value.trim().length > 0 && player.queue.length > 0,
);

async function onSave(): Promise<void> {
  if (!canSave.value) return;
  const name = newName.value.trim();
  const saved = await run(
    () => playlists.save(name, player.queue.map((t) => t.path)),
    { errorPrefix: "Couldn't save playlist", success: `Saved "${name}".` },
  );
  if (saved) newName.value = "";
}

// Load a playlist into the queue and start it.
async function onOpen(p: PlaylistSummary): Promise<void> {
  const rows = await run(() => api.loadPlaylist(p.path), {
    errorPrefix: `Couldn't open "${p.name}"`,
  });
  if (rows) await player.playTracks(rows.map(toQueueTrack), 0);
}
</script>

<style scoped>
.playlists-pane {
  min-width: 0;
}
.queue-pane {
  width: 22rem;
  max-width: 40%;
  flex: 0 0 auto;
}
</style>
