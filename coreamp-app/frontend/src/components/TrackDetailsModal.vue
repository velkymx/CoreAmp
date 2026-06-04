<template>
  <div
    v-if="ui.detailsTarget"
    class="modal-backdrop-custom"
    data-test="details-modal"
    @click.self="ui.closeDetails"
  >
    <div class="modal-card shadow rounded bg-body p-3" role="dialog" aria-label="Track details">
      <div class="d-flex gap-3 mb-3">
        <AlbumArt :path="track.path" :size="96" />
        <div class="min-w-0">
          <h2 class="h6 mb-1 text-truncate" data-test="details-title">
            {{ track.title || track.filename }}
          </h2>
          <p class="text-secondary small mb-2 text-truncate">
            {{ track.artist || "Unknown artist" }}
          </p>
          <VibeButton variant="primary" size="sm" data-test="details-play" @click="playTrack">
            <VibeIcon icon="play-fill" /> Play
          </VibeButton>
        </div>
      </div>

      <dl class="details-grid small mb-3">
        <dt class="text-secondary">Album</dt>
        <dd class="text-truncate">{{ track.album || "—" }}</dd>
        <dt class="text-secondary">Album artist</dt>
        <dd class="text-truncate">{{ track.album_artist || "—" }}</dd>
        <dt class="text-secondary">Year</dt>
        <dd>{{ track.year || "—" }}</dd>
        <dt class="text-secondary">Genre</dt>
        <dd class="text-truncate">{{ track.genre || "—" }}</dd>
        <dt class="text-secondary">Duration</dt>
        <dd>{{ formatTime(track.duration) }}</dd>
        <dt class="text-secondary">File</dt>
        <dd class="text-truncate" :title="track.path">{{ track.filename }}</dd>
      </dl>

      <div v-if="track.album" class="mb-2">
        <h3 class="text-secondary text-uppercase small mb-1">Album tracklist</h3>
        <div class="details-list border rounded">
          <div
            v-if="albumTracks.length === 0"
            class="p-2 text-center text-secondary small"
            data-test="details-tracklist-empty"
          >
            No album tracks
          </div>
          <ul v-else class="list-group list-group-flush">
            <li
              v-for="(t, i) in albumTracks"
              :key="t.path"
              class="list-group-item list-group-item-action d-flex justify-content-between gap-2"
              :class="{ active: t.path === track.path }"
              role="button"
              data-test="details-album-track"
              @click="playAlbumFrom(i)"
            >
              <span class="text-truncate">{{ t.title || t.filename }}</span>
              <span class="text-secondary small flex-shrink-0">{{ formatTime(t.duration) }}</span>
            </li>
          </ul>
        </div>
      </div>

      <div class="d-flex justify-content-end mt-3">
        <VibeButton variant="secondary" outline data-test="details-close" @click="ui.closeDetails">
          Close
        </VibeButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import type { LibraryTrack } from "@/types";
import * as api from "@/api/tauri";
import { useUiStore } from "@/stores/ui";
import { usePlayerStore } from "@/stores/player";
import { useNotify } from "@/composables/useNotify";
import { toQueueTrack } from "@/util/track";
import { formatTime } from "@/util/time";
import AlbumArt from "@/components/AlbumArt.vue";

const ui = useUiStore();
const player = usePlayerStore();
const { run } = useNotify();

const albumTracks = ref<LibraryTrack[]>([]);

// detailsTarget is non-null whenever the modal renders.
const track = computed<LibraryTrack>(() => ui.detailsTarget as LibraryTrack);

// Load the album's tracklist whenever a new track opens the panel.
watch(
  () => ui.detailsTarget,
  async (target) => {
    albumTracks.value = [];
    if (!target?.album) return;
    const rows = await run(() => api.listAlbumTracks(target.album as string, target.artist), {
      errorPrefix: "Couldn't load album",
    });
    if (rows) albumTracks.value = rows;
  },
);

function playTrack(): void {
  if (!ui.detailsTarget) return;
  void player.playTracks([toQueueTrack(ui.detailsTarget)], 0);
}

function playAlbumFrom(index: number): void {
  if (albumTracks.value.length === 0) return;
  void player.playTracks(albumTracks.value.map(toQueueTrack), index);
}
</script>

<style scoped>
.modal-backdrop-custom {
  position: fixed;
  inset: 0;
  z-index: 1090;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-card {
  width: min(30rem, 92vw);
  max-height: 90vh;
  overflow: auto;
}
.min-w-0 {
  min-width: 0;
}
.details-grid {
  display: grid;
  grid-template-columns: 5rem 1fr;
  row-gap: 0.25rem;
  column-gap: 0.5rem;
  margin: 0;
}
.details-grid dd {
  margin: 0;
  min-width: 0;
}
.details-list {
  max-height: 16rem;
  overflow: auto;
}
</style>
