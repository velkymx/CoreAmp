<template>
  <div
    v-if="ui.editTarget"
    class="modal-backdrop-custom"
    data-test="edit-modal"
    @click.self="ui.closeEdit"
  >
    <div class="modal-card shadow rounded bg-body p-3" role="dialog" aria-label="Edit metadata">
      <h2 class="h6 mb-3">Edit metadata</h2>
      <div class="mb-2">
        <label class="form-label small">Title</label>
        <VibeFormInput v-model="form.title" data-test="edit-title" />
      </div>
      <div class="mb-2">
        <label class="form-label small">Artist</label>
        <VibeFormInput v-model="form.artist" data-test="edit-artist" />
      </div>
      <div class="mb-2">
        <label class="form-label small">Album</label>
        <VibeFormInput v-model="form.album" data-test="edit-album" />
      </div>
      <div class="mb-2">
        <label class="form-label small">Album artist</label>
        <VibeFormInput v-model="form.album_artist" data-test="edit-album-artist" />
      </div>
      <div class="row g-2 mb-3">
        <div class="col">
          <label class="form-label small">Track #</label>
          <VibeFormInput v-model="form.track_number" type="number" data-test="edit-track-number" />
        </div>
        <div class="col">
          <label class="form-label small">Year</label>
          <VibeFormInput v-model="form.year" data-test="edit-year" />
        </div>
        <div class="col">
          <label class="form-label small">Genre</label>
          <VibeFormInput v-model="form.genre" data-test="edit-genre" />
        </div>
      </div>
      <div class="d-flex justify-content-between gap-2">
        <VibeButton
          variant="secondary"
          outline
          :disabled="saving"
          data-test="edit-artwork"
          @click="onReplaceArtwork"
        >
          Replace artwork…
        </VibeButton>
        <div class="d-flex gap-2">
          <VibeButton variant="secondary" outline data-test="edit-cancel" @click="ui.closeEdit">
            Cancel
          </VibeButton>
          <VibeButton variant="primary" :disabled="saving" data-test="edit-save" @click="onSave">
            Save
          </VibeButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import * as api from "@/api/tauri";
import { useUiStore } from "@/stores/ui";
import { useNotify } from "@/composables/useNotify";

const ui = useUiStore();
const { run } = useNotify();
const saving = ref(false);

const form = reactive({
  title: "",
  artist: "",
  album: "",
  album_artist: "",
  track_number: "",
  year: "",
  genre: "",
});

// Repopulate the form whenever a new track is opened for editing.
watch(
  () => ui.editTarget,
  (track) => {
    form.title = track?.title ?? "";
    form.artist = track?.artist ?? "";
    form.album = track?.album ?? "";
    form.album_artist = track?.album_artist ?? "";
    form.track_number = track?.track_number != null ? String(track.track_number) : "";
    form.year = track?.year ?? "";
    form.genre = track?.genre ?? "";
  },
  { immediate: true },
);

// Parse the track-number field into a positive integer, or null when blank
// or invalid (so it clears the tag rather than writing a bogus value).
function parseTrackNumber(value: string): number | null {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Pick an image and write it into the track's embedded cover art.
async function onReplaceArtwork(): Promise<void> {
  const track = ui.editTarget;
  if (!track) return;
  const paths = await run(() => api.pickScanPaths("image"), {
    errorPrefix: "Image picker failed",
  });
  if (!paths || paths.length === 0) return;
  saving.value = true;
  const ok = await run(() => api.setTrackArtwork(track.path, paths[0]), {
    errorPrefix: "Couldn't set artwork",
    success: "Artwork updated.",
  });
  saving.value = false;
  if (ok) ui.bumpData();
}

async function onSave(): Promise<void> {
  const track = ui.editTarget;
  if (!track) return;
  saving.value = true;
  const result = await run(
    () =>
      api.updateTrackMetadataForPath(track.path, {
        title: form.title.trim() || null,
        artist: form.artist.trim() || null,
        album: form.album.trim() || null,
        album_artist: form.album_artist.trim() || null,
        track_number: parseTrackNumber(form.track_number),
        year: form.year.trim() || null,
        genre: form.genre.trim() || null,
      }),
    { errorPrefix: "Couldn't save metadata", success: "Metadata saved." },
  );
  saving.value = false;
  if (result) {
    ui.bumpData();
    ui.closeEdit();
  }
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
  width: min(28rem, 92vw);
}
</style>
