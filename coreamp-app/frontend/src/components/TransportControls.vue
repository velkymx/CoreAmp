<template>
  <div class="transport-controls d-inline-flex align-items-center gap-2">
    <VibeButton variant="secondary" aria-label="Previous track" @click="emit('prev')">
      <VibeIcon name="skip-start-fill" />
    </VibeButton>
    <VibeButton
      variant="primary"
      data-test="toggle"
      aria-label="Play or pause"
      @click="player.togglePlayback()"
    >
      <VibeIcon :name="player.isPlaying ? 'pause-fill' : 'play-fill'" />
    </VibeButton>
    <VibeButton variant="secondary" aria-label="Next track" @click="emit('next')">
      <VibeIcon name="skip-end-fill" />
    </VibeButton>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";

// prev/next are emitted up; the shell wires them to queue actions in a later
// milestone. The play/pause icon binds to player.isPlaying so it can never
// drift out of sync the way the legacy manual setToggleIcon did.
const emit = defineEmits<{ prev: []; next: [] }>();
const player = usePlayerStore();
</script>
