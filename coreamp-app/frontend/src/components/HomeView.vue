<template>
  <div class="home-view p-3 overflow-auto h-100">
    <h1 class="h4 mb-3">CoreAmp</h1>

    <section class="mb-4">
      <h2 class="h6 text-secondary text-uppercase">Top artists</h2>
      <SummaryGrid :items="topArtistItems" icon="person" @select="onArtist" />
    </section>

    <section>
      <h2 class="h6 text-secondary text-uppercase">Recently played</h2>
      <TrackTable
        :tracks="recent"
        :active-path="player.currentTrack?.path ?? null"
        @play="onPlayRecent"
        @like="onLike"
        @play-next="(t) => player.playNext(toQueueTrack(t))"
        @enqueue="(t) => player.enqueue(toQueueTrack(t))"
      />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { ArtistSummary, LibraryTrack } from "@/types";
import * as api from "@/api/tauri";
import SummaryGrid, { type SummaryItem } from "@/components/SummaryGrid.vue";
import TrackTable from "@/components/TrackTable.vue";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useUiStore } from "@/stores/ui";
import { toQueueTrack } from "@/util/track";
import { useNotify } from "@/composables/useNotify";

const player = usePlayerStore();
const library = useLibraryStore();
const ui = useUiStore();
const { run } = useNotify();

const topArtists = ref<ArtistSummary[]>([]);
const recent = ref<LibraryTrack[]>([]);

async function load(): Promise<void> {
  const data = await run(
    async () =>
      Promise.all([api.listTopArtists(12), api.listRecentlyPlayed(25)]),
    { errorPrefix: "Couldn't load dashboard" },
  );
  if (data) [topArtists.value, recent.value] = data;
}
onMounted(load);

const topArtistItems = computed<SummaryItem[]>(() =>
  topArtists.value.map((a) => ({
    key: a.name,
    title: a.name,
    subtitle: `${a.track_count} tracks`,
  })),
);

function onPlayRecent(index: number): void {
  void player.playTracks(recent.value.map(toQueueTrack), index);
}

async function onLike(path: string): Promise<void> {
  const liked = await api.toggleLiked(path);
  const track = recent.value.find((t) => t.path === path);
  if (track) track.liked = liked;
}

// Drill into a Library search for the chosen artist.
async function onArtist(name: string): Promise<void> {
  library.search = name;
  library.genreFilter = null;
  library.view = "tracks";
  await library.loadTracks();
  ui.setTab("library");
}

defineExpose({ load });
</script>
