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
import { useNotify } from "@/composables/useNotify";

const player = usePlayerStore();
const { run } = useNotify();

// Sentinel for the "system default" choice. The backend models default as
// `null`; an empty string keeps the value DOM/select-friendly and is mapped back
// at the boundary.
const DEFAULT = "";

onMounted(() => {
  void run(() => player.loadOutputDevices(), {
    errorPrefix: "Couldn't list output devices",
  });
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
    void run(() => player.setOutputDevice(name), {
      errorPrefix: "Couldn't switch output device",
      success: name ? `Output: ${name}` : "Output: System default",
    });
  },
});
</script>
