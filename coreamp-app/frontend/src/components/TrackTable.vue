<template>
  <div class="track-table">
    <div v-if="tracks.length === 0" class="p-4 text-center text-secondary" data-test="track-empty">
      No tracks
    </div>
    <table v-else class="table table-hover table-sm align-middle mb-0">
      <tbody>
        <tr
          v-for="(track, index) in tracks"
          :key="track.path"
          class="track-row"
          :class="{ 'is-active': track.path === activePath }"
          data-test="track-row"
          @click="$emit('play', index)"
        >
          <td class="track-art-cell">
            <div class="track-art d-flex align-items-center justify-content-center text-secondary rounded">
              <VibeIcon icon="music-note-beamed" />
            </div>
          </td>
          <td class="track-main">
            <div class="track-title text-truncate" data-test="track-title">
              {{ track.title || track.filename }}
            </div>
            <div class="track-sub text-truncate text-secondary small">
              {{ track.artist || "Unknown artist" }}
            </div>
          </td>
          <td class="track-album text-truncate text-secondary d-none d-md-table-cell">
            {{ track.album || "" }}
          </td>
          <td class="track-duration text-secondary text-end font-monospace small">
            {{ formatTime(track.duration) }}
          </td>
          <td class="track-like-cell text-end">
            <VibeButton
              variant="link"
              data-test="track-like"
              :aria-pressed="track.liked"
              aria-label="Like"
              @click.stop="$emit('like', track.path)"
            >
              <VibeIcon :icon="track.liked ? 'heart-fill' : 'heart'" />
            </VibeButton>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import type { LibraryTrack } from "@/types";
import { formatTime } from "@/util/time";

defineProps<{
  tracks: LibraryTrack[];
  activePath?: string | null;
}>();

defineEmits<{
  (e: "play", index: number): void;
  (e: "like", path: string): void;
}>();
</script>

<style scoped>
.track-row {
  cursor: pointer;
}
.track-row.is-active {
  background: var(--bs-primary-bg-subtle, rgba(13, 110, 253, 0.15));
}
.track-art {
  width: 36px;
  height: 36px;
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.15));
}
.track-art-cell {
  width: 48px;
}
.track-main {
  max-width: 0;
  width: 100%;
}
.track-album {
  max-width: 16rem;
}
</style>
