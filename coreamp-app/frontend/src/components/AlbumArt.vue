<template>
  <img
    v-if="url"
    :src="url"
    class="album-art rounded"
    :style="boxStyle"
    alt=""
    data-test="album-art"
  />
  <div
    v-else
    class="album-art album-art--empty rounded d-flex align-items-center justify-content-center text-secondary"
    :style="boxStyle"
    data-test="album-art-empty"
  >
    <VibeIcon icon="music-note-beamed" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import * as api from "@/api/tauri";
import { artworkUrl } from "@/util/signal";

const props = withDefaults(defineProps<{ path: string; size?: number }>(), {
  size: 40,
});

// Shared caches so a given file's artwork is only read once across every row,
// the now-playing panel, etc. In-flight promises are deduped too.
const urlCache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

const url = ref<string | null>(null);

const boxStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}));

async function fetchArt(path: string): Promise<string | null> {
  if (urlCache.has(path)) return urlCache.get(path) ?? null;
  let p = inflight.get(path);
  if (!p) {
    p = api
      .readTrackArtwork(path, 128)
      .then((art) => artworkUrl(art))
      .catch(() => null)
      .then((result) => {
        urlCache.set(path, result);
        inflight.delete(path);
        return result;
      });
    inflight.set(path, p);
  }
  return p;
}

watch(
  () => props.path,
  async (path) => {
    url.value = urlCache.get(path) ?? null;
    if (!path) return;
    const resolved = await fetchArt(path);
    // Guard against a recycled row pointing elsewhere by the time we resolve.
    if (props.path === path) url.value = resolved;
  },
  { immediate: true },
);
</script>

<style scoped>
.album-art {
  flex: 0 0 auto;
  object-fit: cover;
}
.album-art--empty {
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.15));
}
</style>
