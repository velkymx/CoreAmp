<template>
  <div class="transport-controls d-inline-flex align-items-center gap-2">
    <VibeButton variant="secondary" aria-label="Previous track" @click="player.prevTrack()">
      <VibeIcon icon="skip-start-fill" />
    </VibeButton>
    <VibeButton
      variant="primary"
      data-test="toggle"
      aria-label="Play or pause"
      @click="player.togglePlayback()"
    >
      <VibeIcon :icon="player.isPlaying ? 'pause-fill' : 'play-fill'" />
    </VibeButton>
    <VibeButton variant="secondary" aria-label="Next track" @click="player.nextTrack()">
      <VibeIcon icon="skip-end-fill" />
    </VibeButton>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";

// Prev/Next/Play-Pause all drive the player store directly. The play/pause icon
// binds to player.isPlaying so it can never drift out of sync the way the legacy
// manual setToggleIcon did.
const player = usePlayerStore();
</script>
