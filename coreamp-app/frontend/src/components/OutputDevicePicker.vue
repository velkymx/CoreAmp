<template>
  <VibeFormSelect
    v-model="selected"
    :options="options"
    aria-label="Output device"
    data-test="output-device-picker"
  />
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import { usePlayerStore } from "@/stores/player";

const player = usePlayerStore();

// Sentinel for the "system default" choice. The backend models default as
// `null`; an empty string keeps the value DOM/select-friendly and is mapped back
// at the boundary.
const DEFAULT = "";

onMounted(() => {
  void player.loadOutputDevices();
});

const options = computed<FormSelectOption[]>(() => [
  { value: DEFAULT, text: "System default" },
  ...player.outputDevices.map((device) => ({
    value: device.name,
    text: device.is_default ? `${device.name} (default)` : device.name,
  })),
]);

const selected = computed<FormSelectOptionValue>({
  get: () => player.selectedOutputDevice ?? DEFAULT,
  set: (value) => {
    const name = value === DEFAULT || value == null ? null : String(value);
    void player.setOutputDevice(name);
  },
});
</script>
