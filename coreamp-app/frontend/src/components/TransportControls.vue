<template>
  <div class="transport-controls d-inline-flex align-items-center gap-2">
    <VibeButton
      :variant="player.shuffle ? 'primary' : 'secondary'"
      outline
      data-test="shuffle"
      :aria-pressed="player.shuffle"
      aria-label="Shuffle"
      @click="player.toggleShuffle()"
    >
      <VibeIcon icon="shuffle" />
    </VibeButton>
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
    <VibeButton
      :variant="player.repeatMode !== 'off' ? 'primary' : 'secondary'"
      outline
      data-test="repeat"
      :aria-pressed="player.repeatMode !== 'off'"
      aria-label="Repeat"
      @click="player.cycleRepeat()"
    >
      <VibeIcon :icon="player.repeatMode === 'track' ? 'repeat-1' : 'repeat'" />
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
