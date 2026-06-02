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
      <TransportControls />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, defineComponent, h } from "vue";
import TransportControls from "@/components/TransportControls.vue";

const activeTab = ref("home");

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
</style>
