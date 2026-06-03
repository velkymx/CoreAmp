<template>
  <div class="app-shell">
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
    <footer class="player-bar p-2 border-top">
      <ProgressBar />
      <div class="d-flex align-items-center justify-content-between gap-2">
        <NowPlaying class="player-now-playing" />
        <TransportControls />
        <div class="d-flex align-items-center gap-2">
          <LikeButton />
          <OutputDevicePicker class="player-output" />
          <VolumeControl />
        </div>
      </div>
    </footer>
    <NotificationHost />
    <EditMetadataModal />
    <AddToPlaylistModal />
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount } from "vue";
import TransportControls from "@/components/TransportControls.vue";
import ProgressBar from "@/components/ProgressBar.vue";
import VolumeControl from "@/components/VolumeControl.vue";
import LikeButton from "@/components/LikeButton.vue";
import NowPlaying from "@/components/NowPlaying.vue";
import OutputDevicePicker from "@/components/OutputDevicePicker.vue";
import LibraryView from "@/components/LibraryView.vue";
import LikedView from "@/components/LikedView.vue";
import PlaylistsView from "@/components/PlaylistsView.vue";
import HomeView from "@/components/HomeView.vue";
import SettingsView from "@/components/SettingsView.vue";
import AudioView from "@/components/AudioView.vue";
import NotificationHost from "@/components/NotificationHost.vue";
import EditMetadataModal from "@/components/EditMetadataModal.vue";
import AddToPlaylistModal from "@/components/AddToPlaylistModal.vue";
import { usePlayerStore } from "@/stores/player";
import { useUiStore, type TabName } from "@/stores/ui";

const player = usePlayerStore();
const ui = useUiStore();

// Activate the native audio path (or fall back to web), then poll the native
// engine for live playback position to drive the progress bar.
let progressTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  void player.init();
  progressTimer = setInterval(() => {
    void player.refreshNativeStatus();
  }, 500);
});
onBeforeUnmount(() => {
  if (progressTimer !== undefined) clearInterval(progressTimer);
});

</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.player-bar {
  position: sticky;
  bottom: 0;
  background: var(--bs-body-bg);
}
.player-now-playing {
  flex: 1 1 0;
  min-width: 0;
  max-width: 40%;
}
.player-output {
  max-width: 12rem;
}
</style>
