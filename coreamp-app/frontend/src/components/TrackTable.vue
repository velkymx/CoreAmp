<template>
  <div class="track-table">
    <div v-if="tracks.length === 0" class="p-4 text-center text-secondary" data-test="track-empty">
      No tracks
    </div>
    <table v-else class="table table-hover table-sm align-middle mb-0">
      <thead v-if="sortable">
        <tr class="track-head">
          <th class="track-art-cell"></th>
          <th data-test="sort-title" @click="$emit('sort', 'title')">
            Title<span class="sort-ind">{{ indicator("title") }}</span>
          </th>
          <th class="d-none d-md-table-cell" data-test="sort-album" @click="$emit('sort', 'album')">
            Album<span class="sort-ind">{{ indicator("album") }}</span>
          </th>
          <th class="text-end" data-test="sort-duration" @click="$emit('sort', 'duration')">
            Time<span class="sort-ind">{{ indicator("duration") }}</span>
          </th>
          <th></th>
          <th></th>
        </tr>
      </thead>
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
              <button
                v-if="track.artist"
                type="button"
                class="meta-link"
                data-test="track-artist"
                @click.stop="$emit('browse', track.artist)"
              >
                {{ track.artist }}
              </button>
              <span v-else>Unknown artist</span>
            </div>
          </td>
          <td class="track-album text-truncate d-none d-md-table-cell">
            <button
              v-if="track.album"
              type="button"
              class="meta-link text-secondary"
              data-test="track-album"
              @click.stop="$emit('browse', track.album)"
            >
              {{ track.album }}
            </button>
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
          <td class="track-menu-cell text-end position-relative">
            <VibeButton
              variant="link"
              data-test="track-menu"
              aria-label="More actions"
              @click.stop="toggleMenu(index)"
            >
              <VibeIcon icon="three-dots" />
            </VibeButton>
            <div
              v-if="openIndex === index"
              class="track-menu shadow rounded border bg-body"
              data-test="track-menu-popup"
              @click.stop
            >
              <button type="button" class="track-menu-item" data-test="menu-play-next" @click.stop="emitMenu('play-next', track)">
                Play next
              </button>
              <button type="button" class="track-menu-item" data-test="menu-queue" @click.stop="emitMenu('enqueue', track)">
                Add to queue
              </button>
              <button type="button" class="track-menu-item" data-test="menu-add-playlist" @click.stop="emitMenu('add-to-playlist', track)">
                Add to playlist…
              </button>
              <button type="button" class="track-menu-item" data-test="menu-edit" @click.stop="emitMenu('edit', track)">
                Edit metadata…
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { LibraryTrack } from "@/types";
import { formatTime } from "@/util/time";

const props = withDefaults(
  defineProps<{
    tracks: LibraryTrack[];
    activePath?: string | null;
    sortable?: boolean;
    sortKey?: "title" | "artist" | "album" | "duration" | null;
    sortDir?: "asc" | "desc";
  }>(),
  { activePath: null, sortable: false, sortKey: null, sortDir: "asc" },
);

// Sort arrow for a column header, blank when that column isn't the active sort.
function indicator(key: "title" | "album" | "duration"): string {
  if (props.sortKey !== key) return "";
  return props.sortDir === "asc" ? " ▲" : " ▼";
}

const emit = defineEmits<{
  (e: "play", index: number): void;
  (e: "like", path: string): void;
  (e: "play-next", track: LibraryTrack): void;
  (e: "enqueue", track: LibraryTrack): void;
  (e: "add-to-playlist", track: LibraryTrack): void;
  (e: "edit", track: LibraryTrack): void;
  (e: "browse", value: string): void;
  (e: "sort", key: "title" | "album" | "duration"): void;
}>();

const openIndex = ref(-1);

function toggleMenu(index: number): void {
  openIndex.value = openIndex.value === index ? -1 : index;
}

function emitMenu(
  event: "play-next" | "enqueue" | "add-to-playlist" | "edit",
  track: LibraryTrack,
): void {
  if (event === "play-next") emit("play-next", track);
  else if (event === "enqueue") emit("enqueue", track);
  else if (event === "add-to-playlist") emit("add-to-playlist", track);
  else emit("edit", track);
  openIndex.value = -1;
}
</script>

<style scoped>
.track-row {
  cursor: pointer;
}
.track-head th {
  cursor: pointer;
  user-select: none;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--bs-secondary-color, #6c757d);
}
.sort-ind {
  font-size: 0.7rem;
}
.track-row.is-active {
  background: var(--bs-primary-bg-subtle, rgba(13, 110, 253, 0.15));
}
.meta-link {
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  max-width: 100%;
  text-align: left;
}
.meta-link:hover {
  text-decoration: underline;
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
.track-menu {
  position: absolute;
  right: 0.5rem;
  top: 100%;
  z-index: 10;
  min-width: 11rem;
  padding: 0.25rem;
}
.track-menu-item {
  display: block;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.35rem 0.6rem;
  border-radius: 0.25rem;
  color: inherit;
}
.track-menu-item:hover {
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.15));
}
</style>
