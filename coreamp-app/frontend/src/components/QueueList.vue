<template>
  <div class="queue-list d-flex flex-column h-100">
    <div class="queue-header d-flex align-items-center gap-2 p-2 border-bottom">
      <span class="fw-semibold flex-grow-1">Up next</span>
      <VibeButton
        variant="secondary"
        outline
        size="sm"
        :class="{ active: player.stopAfterCurrent }"
        :aria-pressed="player.stopAfterCurrent"
        data-test="stop-after"
        @click="player.toggleStopAfterCurrent"
      >
        Stop after current
      </VibeButton>
      <VibeButton
        variant="secondary"
        outline
        size="sm"
        :disabled="player.currentIndex <= 0"
        data-test="clear-played"
        @click="player.clearPlayed"
      >
        Clear played
      </VibeButton>
    </div>

    <div class="queue-body flex-grow-1 overflow-auto">
      <div
        v-if="player.queue.length === 0"
        class="p-4 text-center text-secondary"
        data-test="queue-empty"
      >
        Queue is empty
      </div>
      <ul v-else class="list-group list-group-flush">
        <li
          v-for="(track, index) in player.queue"
          :key="`${track.path}-${index}`"
          class="list-group-item d-flex align-items-center gap-2"
          :class="{ 'is-current': index === player.currentIndex }"
          data-test="queue-row"
        >
          <button
            type="button"
            class="btn btn-link text-start flex-grow-1 text-decoration-none p-0 text-truncate"
            data-test="queue-play"
            @click="player.jumpTo(index)"
          >
            <span class="fw-semibold">{{ track.title || track.path }}</span>
            <span class="text-secondary small ms-2">{{ track.artist || "" }}</span>
          </button>
          <VibeButton
            variant="link"
            size="sm"
            :disabled="index === 0"
            aria-label="Move up"
            data-test="queue-up"
            @click="player.moveInQueue(index, index - 1)"
          >
            <VibeIcon icon="chevron-up" />
          </VibeButton>
          <VibeButton
            variant="link"
            size="sm"
            :disabled="index === player.queue.length - 1"
            aria-label="Move down"
            data-test="queue-down"
            @click="player.moveInQueue(index, index + 1)"
          >
            <VibeIcon icon="chevron-down" />
          </VibeButton>
          <VibeButton
            variant="link"
            size="sm"
            aria-label="Remove from queue"
            data-test="queue-remove"
            @click="player.removeAt(index)"
          >
            <VibeIcon icon="x-lg" />
          </VibeButton>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";

const player = usePlayerStore();
</script>

<style scoped>
.queue-row.is-current {
  background: var(--bs-primary-bg-subtle, rgba(13, 110, 253, 0.15));
}
</style>
