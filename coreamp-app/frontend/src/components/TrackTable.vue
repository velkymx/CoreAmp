<template>
  <div class="track-table">
    <div v-if="tracks.length === 0" class="p-4 text-center text-secondary" data-test="track-empty">
      No tracks
    </div>
    <VibeDataTable
      v-else
      :items="tracks"
      :columns="columns"
      row-key="path"
      hover
      :searchable="searchable"
      :per-page="50"
      data-test="track-datatable"
      @row-clicked="(item: LibraryTrack) => $emit('play', item)"
    >
      <template #cell(title)="{ item }">
        <div class="d-flex align-items-center gap-2">
          <AlbumArt :path="item.path" :size="36" />
          <span v-if="item.path === activePath" class="text-primary">▶</span>
          <span class="text-truncate" data-test="track-title">{{ item.title || item.filename }}</span>
        </div>
      </template>

      <template #cell(artist)="{ item }">
        <button
          v-if="item.artist"
          type="button"
          class="meta-link"
          data-test="track-artist"
          @click.stop="$emit('browse', item.artist)"
        >
          {{ item.artist }}
        </button>
        <span v-else class="text-secondary">Unknown artist</span>
      </template>

      <template #cell(album)="{ item }">
        <button
          v-if="item.album"
          type="button"
          class="meta-link text-secondary"
          data-test="track-album"
          @click.stop="$emit('browse', item.album)"
        >
          {{ item.album }}
        </button>
      </template>

      <template #cell(actions)="{ item }">
        <div class="d-flex align-items-center justify-content-end gap-1 position-relative">
          <VibeButton
            variant="link"
            data-test="track-like"
            :aria-pressed="item.liked"
            aria-label="Like"
            @click.stop="$emit('like', item.path)"
          >
            <VibeIcon :icon="item.liked ? 'heart-fill' : 'heart'" />
          </VibeButton>
          <VibeButton
            variant="link"
            data-test="track-menu"
            aria-label="More actions"
            @click.stop="toggleMenu(item.path)"
          >
            <VibeIcon icon="three-dots" />
          </VibeButton>
          <div
            v-if="openPath === item.path"
            class="track-menu shadow rounded border bg-body"
            data-test="track-menu-popup"
            @click.stop
          >
            <VibeButton variant="link" class="track-menu-item" data-test="menu-play-here" @click.stop="emitMenu('play-from-here', item)">
              Play from here
            </VibeButton>
            <VibeButton variant="link" class="track-menu-item" data-test="menu-play-next" @click.stop="emitMenu('play-next', item)">
              Play next
            </VibeButton>
            <VibeButton variant="link" class="track-menu-item" data-test="menu-queue" @click.stop="emitMenu('enqueue', item)">
              Add to queue
            </VibeButton>
            <VibeButton variant="link" class="track-menu-item" data-test="menu-add-playlist" @click.stop="emitMenu('add-to-playlist', item)">
              Add to playlist…
            </VibeButton>
            <VibeButton variant="link" class="track-menu-item" data-test="menu-details" @click.stop="emitMenu('details', item)">
              Track details…
            </VibeButton>
            <VibeButton variant="link" class="track-menu-item" data-test="menu-edit" @click.stop="emitMenu('edit', item)">
              Edit metadata…
            </VibeButton>
          </div>
        </div>
      </template>
    </VibeDataTable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import type { DataTableColumn } from "@velkymx/vibeui";
import type { LibraryTrack } from "@/types";
import { formatTime } from "@/util/time";
import AlbumArt from "@/components/AlbumArt.vue";

const props = withDefaults(
  defineProps<{
    tracks: LibraryTrack[];
    activePath?: string | null;
    searchable?: boolean;
  }>(),
  { activePath: null, searchable: true },
);
void props;

const emit = defineEmits<{
  (e: "play", track: LibraryTrack): void;
  (e: "like", path: string): void;
  (e: "play-next", track: LibraryTrack): void;
  (e: "enqueue", track: LibraryTrack): void;
  (e: "add-to-playlist", track: LibraryTrack): void;
  (e: "edit", track: LibraryTrack): void;
  (e: "details", track: LibraryTrack): void;
  (e: "play-from-here", track: LibraryTrack): void;
  (e: "browse", value: string): void;
}>();

const columns = computed<DataTableColumn[]>(() => [
  {
    key: "track_number",
    label: "#",
    class: "d-none d-lg-table-cell text-secondary",
    headerClass: "d-none d-lg-table-cell",
    formatter: (v) => (v == null ? "" : String(v)),
  },
  {
    key: "title",
    label: "Title",
    formatter: (_v, row) => {
      const t = row as unknown as LibraryTrack;
      return t.title || t.filename;
    },
  },
  { key: "artist", label: "Artist" },
  { key: "album", label: "Album" },
  {
    key: "genre",
    label: "Genre",
    class: "d-none d-lg-table-cell",
    headerClass: "d-none d-lg-table-cell",
  },
  {
    key: "year",
    label: "Year",
    class: "d-none d-lg-table-cell",
    headerClass: "d-none d-lg-table-cell",
  },
  {
    key: "duration",
    label: "Time",
    formatter: (v) => formatTime(v as number | null),
    tdStyle: { textAlign: "right" },
  },
  { key: "actions", label: "", sortable: false, searchable: false },
]);

const openPath = ref<string | null>(null);

function toggleMenu(path: string): void {
  openPath.value = openPath.value === path ? null : path;
}

function emitMenu(
  event: "play-from-here" | "play-next" | "enqueue" | "add-to-playlist" | "edit" | "details",
  track: LibraryTrack,
): void {
  if (event === "play-from-here") emit("play-from-here", track);
  else if (event === "play-next") emit("play-next", track);
  else if (event === "enqueue") emit("enqueue", track);
  else if (event === "add-to-playlist") emit("add-to-playlist", track);
  else if (event === "details") emit("details", track);
  else emit("edit", track);
  openPath.value = null;
}
</script>

<style scoped>
.track-table {
  height: 100%;
  min-height: 18rem;
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
}
.track-table :deep(.table-responsive) {
  flex: 1 1 auto;
  min-height: 0;
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
  text-decoration: none;
}
.track-menu-item:hover {
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.15));
  color: inherit;
  text-decoration: none;
}
</style>
