<template>
  <VibeButton
    variant="secondary"
    outline
    data-test="like"
    :disabled="!player.currentTrack"
    :aria-pressed="Boolean(player.currentTrack?.liked)"
    aria-label="Like this track"
    @click="player.toggleLike()"
  >
    <VibeIcon :icon="player.currentTrack?.liked ? 'heart-fill' : 'heart'" />
  </VibeButton>
</template>

<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";

const player = usePlayerStore();
</script>
