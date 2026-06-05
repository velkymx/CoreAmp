<template>
  <div class="volume-control d-flex align-items-center gap-2">
    <VibeButton
      variant="secondary"
      outline
      data-test="mute"
      :aria-label="player.muted ? 'Unmute' : 'Mute'"
      @click="player.toggleMute()"
    >
      <VibeIcon :icon="volumeIcon" />
    </VibeButton>
    <VibeSlider
      class="volume-slider flex-grow-1"
      :model-value="player.muted ? 0 : player.volume"
      :min="0"
      :max="1"
      :step="0.01"
      aria-label="Volume"
      @update:model-value="onVolume"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePlayerStore } from "@/stores/player";

const player = usePlayerStore();

const volumeIcon = computed(() => {
  if (player.muted || player.volume === 0) return "volume-mute-fill";
  return player.volume < 0.5 ? "volume-down-fill" : "volume-up-fill";
});

function onVolume(value: number): void {
  void player.setVolume(value);
}
</script>
