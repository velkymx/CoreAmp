<template>
  <div class="app-shell p-3">
    <div v-if="notify.busy" class="global-busy" data-test="global-busy" aria-hidden="true">
      <span class="global-busy-bar"></span>
    </div>
    <!-- Player-first top region: player card on the left, queue on the right. -->
    <section class="top-region">
      <PlayerCard class="player-pane" />
      <aside class="queue-pane rounded">
        <QueueList />
      </aside>
    </section>

    <!-- Library / tabbed content below the player. -->
    <section class="library-region rounded mt-3">
      <VibeTabs
        :model-value="ui.activeTab"
        fill
        @update:model-value="(t: string) => ui.setTab(t as TabName)"
      >
        <VibeTab name="home" label="Home"><HomeView /></VibeTab>
        <VibeTab name="library" label="Library"><LibraryView /></VibeTab>
        <VibeTab name="liked" label="Liked"><LikedView /></VibeTab>
        <VibeTab name="playlists" label="Playlists"><PlaylistsView /></VibeTab>
        <VibeTab name="audio" label="Audio"><AudioView /></VibeTab>
        <VibeTab name="settings" label="Settings"><SettingsView /></VibeTab>
      </VibeTabs>
    </section>

    <NotificationHost />
    <EditMetadataModal />
    <AddToPlaylistModal />
    <TrackDetailsModal />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from "vue";
import * as api from "@/api/tauri";
import { nowPlayingLabel } from "@/util/track";
import { useMediaSession } from "@/composables/useMediaSession";
import PlayerCard from "@/components/PlayerCard.vue";
import QueueList from "@/components/QueueList.vue";
import LibraryView from "@/components/LibraryView.vue";
import LikedView from "@/components/LikedView.vue";
import PlaylistsView from "@/components/PlaylistsView.vue";
import HomeView from "@/components/HomeView.vue";
import SettingsView from "@/components/SettingsView.vue";
import AudioView from "@/components/AudioView.vue";
import NotificationHost from "@/components/NotificationHost.vue";
import EditMetadataModal from "@/components/EditMetadataModal.vue";
import AddToPlaylistModal from "@/components/AddToPlaylistModal.vue";
import TrackDetailsModal from "@/components/TrackDetailsModal.vue";
import { usePlayerStore } from "@/stores/player";
import { useUiStore, type TabName } from "@/stores/ui";
import { useNotifyStore } from "@/stores/notify";
import { applyShortcut, shouldIgnoreTarget } from "@/composables/useShortcuts";
import { useColorMode } from "@velkymx/vibeui";

const player = usePlayerStore();
const ui = useUiStore();
const notify = useNotifyStore();

// Mirror the current track into the native tray (label + tooltip). Guarded so
// it's a harmless no-op outside a Tauri webview (tests, plain browser dev).
watch(
  () => player.currentTrack,
  (track) => {
    void api.setTrayNowPlaying(nowPlayingLabel(track)).catch(() => {});
  },
);

// OS media keys + Now Playing (macOS) via the Web Media Session API.
const media = useMediaSession();
if (media.available) {
  media.bindTransport(player);
  watch(() => player.currentTrack, (track) => media.setMetadata(track), { immediate: true });
  watch(() => player.isPlaying, (playing) => media.setPlaybackState(playing), { immediate: true });
}
const { initColorMode } = useColorMode();

// Global transport keyboard shortcuts: Space play/pause, ←/→ seek, ↑/↓ volume,
// n/p next/prev, m mute, s shuffle, r repeat. Skipped while typing or when a
// visualizer/game holds focus.
function onGlobalKey(e: KeyboardEvent): void {
  if (ui.interactiveVisualizer) return; // a game owns the keyboard
  if (shouldIgnoreTarget(e.target)) return;
  if (applyShortcut(player, e.key)) e.preventDefault();
}

// Activate the native audio path (or fall back to web), then poll the native
// engine for live playback position to drive the progress bar.
let progressTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  player.init();
  initColorMode(); // apply stored / system color mode
  window.addEventListener("keydown", onGlobalKey);
  progressTimer = setInterval(() => {
    void player.refreshStatus();
  }, 250);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onGlobalKey);
  if (progressTimer !== undefined) clearInterval(progressTimer);
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
}
/* Slim indeterminate top bar shown while any tracked async op is in flight. */
.global-busy {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 2000;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}
.global-busy-bar {
  display: block;
  height: 100%;
  width: 40%;
  background: var(--bs-primary, #0d6efd);
  animation: global-busy-slide 1s ease-in-out infinite;
}
@keyframes global-busy-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}
.top-region {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 22rem;
  gap: 1rem;
  /* Lock the player + queue region so it never pushes the library off-screen;
     each pane scrolls its own overflow. */
  align-items: stretch;
  height: 600px;
}
.player-pane {
  overflow: auto;
}
.queue-pane {
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.25));
  height: 100%;
  min-height: 22rem;
  overflow: hidden;
}
.library-region {
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.25));
  padding: 0.75rem;
}
@media (max-width: 820px) {
  .top-region {
    grid-template-columns: 1fr;
    /* Stacked: let it grow rather than cramming both panes into 600px. */
    height: auto;
  }
  .queue-pane {
    max-height: 18rem;
  }
}
@media (max-width: 560px) {
  .app-shell {
    padding: 0.5rem !important;
  }
  .top-region {
    gap: 0.5rem;
  }
  .library-region {
    padding: 0.5rem;
    margin-top: 0.75rem !important;
  }
}
</style>
