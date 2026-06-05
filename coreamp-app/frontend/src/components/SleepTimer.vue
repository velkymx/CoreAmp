<template>
  <div class="sleep-timer d-flex align-items-center gap-1" :title="title">
    <VibeFormSelect
      :model-value="selected"
      :options="options"
      aria-label="Sleep timer"
      data-test="sleep-select"
      @update:model-value="onSelect"
    />
    <span
      v-if="player.sleepActive"
      class="small text-secondary"
      data-test="sleep-remaining"
    >
      {{ remaining }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import { usePlayerStore } from "@/stores/player";

const player = usePlayerStore();

const options: FormSelectOption[] = [
  { value: 0, text: "No sleep" },
  { value: 15, text: "15 min" },
  { value: 30, text: "30 min" },
  { value: 60, text: "60 min" },
  { value: 90, text: "90 min" },
];

const selected = ref<FormSelectOptionValue>(0);

function onSelect(value: FormSelectOptionValue): void {
  selected.value = value;
  player.setSleepTimer(Number(value));
}

// When the timer fires (or is cleared elsewhere) drop the select back to "off".
watch(
  () => player.sleepActive,
  (active) => {
    if (!active) selected.value = 0;
  },
);

// Drive the countdown off a 1s tick rather than the 4/s status poll.
const now = ref(Date.now());
let tick: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  tick = setInterval(() => (now.value = Date.now()), 1000);
});
onBeforeUnmount(() => {
  if (tick) clearInterval(tick);
});

const remaining = computed(() => {
  if (player.sleepEndsAt == null) return "";
  const secs = Math.max(0, Math.round((player.sleepEndsAt - now.value) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
});

const title = computed(() =>
  player.sleepActive ? `Pausing in ${remaining.value}` : "Sleep timer",
);
</script>

<style scoped>
.sleep-timer :deep(select) {
  min-width: 6.5rem;
}
</style>
