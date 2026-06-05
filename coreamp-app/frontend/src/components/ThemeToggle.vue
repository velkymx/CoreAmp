<template>
  <VibeButton
    variant="secondary"
    outline
    size="sm"
    :aria-label="`Theme: ${label} (click to change)`"
    data-test="theme-toggle"
    @click="cycle"
  >
    <VibeIcon :icon="icon" />
    <span class="d-none d-lg-inline ms-1">{{ label }}</span>
  </VibeButton>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useColorMode } from "@velkymx/vibeui";
import type { ColorMode } from "@velkymx/vibeui";

const { colorMode, setColorMode } = useColorMode();

// System → Light → Dark → System, driven by VibeUI's ColorMode (which persists
// the choice and applies the Bootstrap data-bs-theme + system detection).
const ORDER: ColorMode[] = ["auto", "light", "dark"];
const META: Record<ColorMode, { icon: string; label: string }> = {
  auto: { icon: "circle-half", label: "System" },
  light: { icon: "sun-fill", label: "Light" },
  dark: { icon: "moon-stars-fill", label: "Dark" },
};

const icon = computed(() => META[colorMode.value]?.icon ?? "circle-half");
const label = computed(() => META[colorMode.value]?.label ?? "System");

function cycle(): void {
  const next = ORDER[(ORDER.indexOf(colorMode.value) + 1) % ORDER.length];
  setColorMode(next);
}
</script>
