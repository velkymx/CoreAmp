<template>
  <div class="playlists-view h-100 d-flex flex-column position-relative" :class="{ 'is-dragging': dragging }">
    <div
      v-if="dragging"
      class="drop-hint d-flex align-items-center justify-content-center"
      data-test="drop-hint"
    >
      Drop .m3u files to import
    </div>
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import type { PlaylistSummary } from "@/types";
import * as api from "@/api/tauri";
import { usePlaylistsStore } from "@/stores/playlists";
import { usePlayerStore } from "@/stores/player";
import { toQueueTrack } from "@/util/track";
import { useNotify } from "@/composables/useNotify";

const playlists = usePlaylistsStore();
const player = usePlayerStore();
const { run } = useNotify();
const newName = ref("");
const dragging = ref(false);

// Register a Tauri file-drop listener so dropping .m3u files anywhere on the
// window imports them. Guarded so it's a no-op outside a Tauri webview (tests,
// plain browser dev).
let unlistenDrop: (() => void) | undefined;
onMounted(async () => {
  void playlists.load();
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "over" || payload.type === "enter") {
        dragging.value = true;
      } else if (payload.type === "drop") {
        dragging.value = false;
        void playlists.importDropped(payload.paths);
      } else {
        dragging.value = false;
      }
    });
  } catch {
    // Not running inside a Tauri webview; drag-drop import unavailable.
  }
});
onBeforeUnmount(() => unlistenDrop?.());

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

<style scoped>
.drop-hint {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: rgba(13, 110, 253, 0.12);
  border: 2px dashed var(--bs-primary, #0d6efd);
  font-weight: 600;
  pointer-events: none;
}
</style>
