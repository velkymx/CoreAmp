<template>
  <div class="app-shell">
    <VibeTabs v-model="activeTab" fill>
      <VibeTab name="home" label="Home"><HomePlaceholder /></VibeTab>
      <VibeTab name="library" label="Library"><Placeholder label="Library" /></VibeTab>
      <VibeTab name="liked" label="Liked"><Placeholder label="Liked" /></VibeTab>
      <VibeTab name="playlists" label="Playlists"><Placeholder label="Playlists" /></VibeTab>
      <VibeTab name="audio" label="Audio"><Placeholder label="Audio" /></VibeTab>
      <VibeTab name="settings" label="Settings"><Placeholder label="Settings" /></VibeTab>
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
  </div>
</template>

<script setup lang="ts">
import { ref, defineComponent, h, onMounted, onBeforeUnmount } from "vue";
import TransportControls from "@/components/TransportControls.vue";
import ProgressBar from "@/components/ProgressBar.vue";
import VolumeControl from "@/components/VolumeControl.vue";
import LikeButton from "@/components/LikeButton.vue";
import NowPlaying from "@/components/NowPlaying.vue";
import OutputDevicePicker from "@/components/OutputDevicePicker.vue";
import { usePlayerStore } from "@/stores/player";

const activeTab = ref("home");
const player = usePlayerStore();

// Poll the native engine for live playback position to drive the progress bar.
let progressTimer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  progressTimer = setInterval(() => {
    void player.refreshNativeStatus();
  }, 500);
});
onBeforeUnmount(() => {
  if (progressTimer !== undefined) clearInterval(progressTimer);
});

const Placeholder = defineComponent({
  props: { label: { type: String, required: true } },
  setup: (props) => () =>
    h("div", { class: "p-3 text-secondary" }, `${props.label} — coming soon`),
});
const HomePlaceholder = defineComponent({
  setup: () => () => h("div", { class: "p-3" }, "CoreAmp"),
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
