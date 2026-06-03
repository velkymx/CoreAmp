<template>
  <div class="player-card rounded">
    <Visualizer class="player-viz" />

    <div class="player-body p-3">
      <NowPlaying class="mb-3" />
      <ProgressBar class="mb-2" />
      <VolumeControl class="mb-3 player-volume" />
      <div class="d-flex align-items-center justify-content-between gap-2">
        <TransportControls />
        <div class="d-flex align-items-center gap-2">
          <LikeButton />
          <ThemeToggle />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Visualizer from "@/components/Visualizer.vue";
import NowPlaying from "@/components/NowPlaying.vue";
import ProgressBar from "@/components/ProgressBar.vue";
import VolumeControl from "@/components/VolumeControl.vue";
import TransportControls from "@/components/TransportControls.vue";
import LikeButton from "@/components/LikeButton.vue";
import ThemeToggle from "@/components/ThemeToggle.vue";
</script>

<style scoped>
.player-card {
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.25));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.player-viz {
  flex: 0 0 auto;
}
.player-output {
  max-width: 11rem;
}
</style>
