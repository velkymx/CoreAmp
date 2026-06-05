<template>
  <div
    v-if="ui.playlistTarget"
    class="modal-backdrop-custom"
    data-test="addpl-modal"
    @click.self="ui.closeAddToPlaylist"
  >
    <div class="modal-card shadow rounded bg-body p-3" role="dialog" aria-label="Add to playlist">
      <h2 class="h6 mb-1">Add to playlist</h2>
      <p class="text-secondary small text-truncate mb-3">{{ targetLabel }}</p>

      <div class="d-flex gap-2 mb-3">
        <VibeFormInput
          v-model="newName"
          placeholder="New playlist name"
          aria-label="New playlist name"
          data-test="addpl-name"
          class="flex-grow-1"
        />
        <VibeButton
          variant="primary"
          :disabled="!newName.trim()"
          data-test="addpl-create"
          @click="onCreate"
        >
          Create
        </VibeButton>
      </div>

      <div class="addpl-list border rounded">
        <div
          v-if="playlists.playlists.length === 0"
          class="p-3 text-center text-secondary small"
          data-test="addpl-empty"
        >
          No existing playlists
        </div>
        <ul v-else class="list-group list-group-flush">
          <li
            v-for="p in playlists.playlists"
            :key="p.path"
            class="list-group-item list-group-item-action d-flex justify-content-between"
            role="button"
            data-test="addpl-existing"
            @click="onAppend(p.path)"
          >
            <span>{{ p.name }}</span>
            <span class="text-secondary small">{{ p.track_count }}</span>
          </li>
        </ul>
      </div>

      <div class="d-flex justify-content-end mt-3">
        <VibeButton variant="secondary" outline data-test="addpl-close" @click="ui.closeAddToPlaylist">
          Close
        </VibeButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useUiStore } from "@/stores/ui";
import { usePlaylistsStore } from "@/stores/playlists";
import { useNotify } from "@/composables/useNotify";

const ui = useUiStore();
const playlists = usePlaylistsStore();
const { run } = useNotify();
const newName = ref("");

const targetLabel = computed(() => {
  const t = ui.playlistTarget;
  return t ? t.title || t.filename : "";
});

// Make sure the playlist list is loaded whenever the modal opens.
watch(
  () => ui.playlistTarget,
  (target) => {
    if (target) void playlists.load();
  },
);

async function onAppend(playlistPath: string): Promise<void> {
  const track = ui.playlistTarget;
  if (!track) return;
  const ok = await run(() => playlists.append(playlistPath, [track.path]), {
    errorPrefix: "Couldn't add to playlist",
    success: "Added to playlist.",
  });
  if (ok) ui.closeAddToPlaylist();
}

async function onCreate(): Promise<void> {
  const track = ui.playlistTarget;
  if (!track || !newName.value.trim()) return;
  const name = newName.value.trim();
  const ok = await run(() => playlists.save(name, [track.path]), {
    errorPrefix: "Couldn't create playlist",
    success: `Created "${name}".`,
  });
  if (ok) {
    newName.value = "";
    ui.closeAddToPlaylist();
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
.addpl-list {
  max-height: 14rem;
  overflow: auto;
}
</style>
