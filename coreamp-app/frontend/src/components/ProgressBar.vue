<template>
  <div class="progress-bar-row d-flex align-items-center gap-2">
    <span class="time-current text-secondary small">{{ formatTime(player.positionSecs) }}</span>
    <VibeSlider
      class="flex-grow-1"
      :model-value="player.positionSecs"
      :min="0"
      :max="player.durationSecs ?? 0"
      :step="1"
      aria-label="Seek"
      @update:model-value="onScrub"
    />
    <span class="time-total text-secondary small">{{ formatTime(player.durationSecs) }}</span>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";
import { formatTime } from "@/util/time";

const player = usePlayerStore();

function onScrub(value: number): void {
  void player.seek(value);
}
</script>
