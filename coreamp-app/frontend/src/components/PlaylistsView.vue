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
      <VibeDataTable
        v-else
        :items="playlists.playlists"
        :columns="columns"
        row-key="path"
        hover
        :per-page="25"
        data-test="playlists-datatable"
        @row-clicked="(item: PlaylistSummary) => onOpen(item)"
      >
        <template #cell(track_count)="{ value }">{{ value }} tracks</template>
        <template #cell(actions)="{ item }">
          <div class="d-flex justify-content-end gap-1">
            <VibeButton
              variant="secondary"
              outline
              size="sm"
              aria-label="Remove duplicates"
              data-test="playlist-dedup"
              @click.stop="playlists.dedup(item.path)"
            >
              <VibeIcon icon="funnel" />
            </VibeButton>
            <VibeButton
              variant="danger"
              outline
              size="sm"
              aria-label="Delete playlist"
              data-test="playlist-delete"
              @click.stop="playlists.remove(item.path)"
            >
              <VibeIcon icon="trash" />
            </VibeButton>
          </div>
        </template>
      </VibeDataTable>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import type { DataTableColumn } from "@velkymx/vibeui";
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

const columns = computed<DataTableColumn[]>(() => [
  { key: "name", label: "Name" },
  { key: "track_count", label: "Tracks" },
  { key: "actions", label: "", sortable: false, searchable: false },
]);

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
.playlists-list {
  min-height: 18rem;
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
