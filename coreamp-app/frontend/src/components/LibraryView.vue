<template>
  <div class="library-view d-flex flex-column h-100">
    <div class="library-toolbar d-flex gap-2 p-2 align-items-center flex-wrap">
      <VibeButtonGroup>
        <VibeButton
          v-for="v in VIEWS"
          :key="v.id"
          :variant="library.view === v.id ? 'primary' : 'secondary'"
          outline
          :data-test="`view-${v.id}`"
          @click="library.setView(v.id)"
        >
          {{ v.label }}
        </VibeButton>
      </VibeButtonGroup>
      <VibeFormInput
        v-model="searchModel"
        placeholder="Search"
        aria-label="Search library"
        data-test="library-search"
        class="flex-grow-1"
      />
      <VibeFormSelect
        v-if="library.view === 'tracks'"
        v-model="genreModel"
        :options="genreFilterOptions"
        aria-label="Filter by genre"
        data-test="library-genre"
      />
      <VibeButton
        v-if="canSaveSearch"
        variant="secondary"
        outline
        data-test="save-search"
        @click="onSaveSearch"
      >
        Save as playlist
      </VibeButton>
    </div>
    <div class="library-content flex-grow-1 overflow-auto">
      <TrackTable
        v-if="library.view === 'tracks'"
        :tracks="library.tracks"
        :active-path="player.currentTrack?.path ?? null"
        :searchable="false"
        @play="onPlay"
        @like="library.toggleLike"
        @play-next="(t) => player.playNext(toQueueTrack(t))"
        @enqueue="(t) => player.enqueue(toQueueTrack(t))"
        @add-to-playlist="(t) => ui.openAddToPlaylist(t)"
        @edit="(t) => ui.openEdit(t)"
        @details="(t) => ui.openDetails(t)"
        @rate="(p) => library.setRating(p.path, p.rating)"
        @browse="(v) => library.setSearch(v)"
        @play-from-here="onPlayFromHere"
      />
      <SummaryGrid
        v-else
        :items="summaryItems"
        :icon="summaryIcon"
        @select="onSummarySelect"
      />
      <div v-if="library.view === 'tracks' && library.hasMore" class="text-center my-2">
        <VibeButton
          variant="secondary"
          outline
          :disabled="library.loading"
          data-test="library-load-more"
          @click="library.loadMore()"
        >
          {{ library.loading ? "Loading…" : "Load more" }}
        </VibeButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import type { LibraryTrack } from "@/types";
import TrackTable from "@/components/TrackTable.vue";
import SummaryGrid, { type SummaryItem } from "@/components/SummaryGrid.vue";
import { useLibraryStore, type LibraryView } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { usePlaylistsStore } from "@/stores/playlists";
import { useUiStore } from "@/stores/ui";
import { useNotify } from "@/composables/useNotify";
import { toQueueTrack } from "@/util/track";

const library = useLibraryStore();
const player = usePlayerStore();
const playlists = usePlaylistsStore();
const ui = useUiStore();
const { run } = useNotify();

// A filter is "active" when a search term or genre narrows the track list, so
// the result is a meaningful subset worth saving as a playlist.
const canSaveSearch = computed(
  () =>
    library.view === "tracks" &&
    library.tracks.length > 0 &&
    (library.search.trim() !== "" || library.genreFilter != null),
);

// Name the saved playlist after whatever is narrowing the list.
function searchPlaylistName(): string {
  return library.search.trim() || library.genreFilter || "Library results";
}

// Persist the currently filtered tracks as a new playlist.
async function onSaveSearch(): Promise<void> {
  const name = searchPlaylistName();
  const paths = library.tracks.map((t) => t.path);
  await run(() => playlists.save(name, paths), {
    errorPrefix: "Couldn't save playlist",
    success: `Saved "${name}".`,
  });
}

// Reload the track list after a metadata edit elsewhere.
watch(
  () => ui.dataVersion,
  () => {
    if (library.view === "tracks") void library.loadTracks();
    else void library.refresh();
  },
);

const VIEWS: { id: LibraryView; label: string }[] = [
  { id: "tracks", label: "Tracks" },
  { id: "artists", label: "Artists" },
  { id: "albums", label: "Albums" },
  { id: "genres", label: "Genres" },
];

onMounted(() => {
  void library.loadGenreOptions();
  void library.refresh();
});

const searchModel = computed<string>({
  get: () => library.search,
  set: (value) => void library.setSearch(value),
});

const genreModel = computed<FormSelectOptionValue>({
  get: () => library.genreFilter ?? "",
  set: (value) => void library.setGenreFilter(value ? String(value) : null),
});

const genreFilterOptions = computed<FormSelectOption[]>(() => [
  { value: "", text: "All genres" },
  ...library.genreOptions.map((g) => ({ value: g, text: g })),
]);

const summaryIcon = computed(() =>
  library.view === "artists" ? "person" : library.view === "genres" ? "tag" : "disc",
);

const summaryItems = computed<SummaryItem[]>(() => {
  if (library.view === "artists") {
    return library.artists.map((a) => ({
      key: a.name,
      title: a.name,
      subtitle: `${a.track_count} tracks`,
    }));
  }
  if (library.view === "albums") {
    return library.albums.map((a) => ({
      key: a.title,
      title: a.title,
      subtitle: a.artist ?? "",
    }));
  }
  return library.genreSummaries.map((g) => ({
    key: g.name,
    title: g.name,
    subtitle: `${g.track_count} tracks`,
  }));
});

// Clicking a track replaces the queue with just that track and plays it.
function onPlay(track: LibraryTrack): void {
  void player.playTracks([toQueueTrack(track)], 0);
}

// "Play from here": queue the whole list from this track onward.
function onPlayFromHere(track: LibraryTrack): void {
  const index = library.tracks.findIndex((t) => t.path === track.path);
  void player.playTracks(library.tracks.map(toQueueTrack), Math.max(index, 0));
}

// Clicking a summary card drills into the matching tracks: genres use the
// dedicated filter, artists/albums fall back to a name search.
async function onSummarySelect(key: string): Promise<void> {
  if (library.view === "genres") {
    library.genreFilter = key;
    library.search = "";
  } else {
    library.search = key;
    library.genreFilter = null;
  }
  await library.setView("tracks");
}
</script>

<style scoped>
.library-content {
  min-height: 0;
}
</style>
