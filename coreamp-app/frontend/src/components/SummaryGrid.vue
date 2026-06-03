<template>
  <div class="summary-grid">
    <div v-if="items.length === 0" class="p-4 text-center text-secondary" data-test="summary-empty">
      Nothing here yet
    </div>
    <div v-else class="grid-wrap">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="summary-card text-start border rounded p-2"
        data-test="summary-card"
        @click="$emit('select', item.key)"
      >
        <div class="summary-art d-flex align-items-center justify-content-center text-secondary rounded mb-2">
          <VibeIcon :icon="icon" />
        </div>
        <div class="summary-title text-truncate fw-semibold">{{ item.title }}</div>
        <div v-if="item.subtitle" class="summary-sub text-truncate text-secondary small">
          {{ item.subtitle }}
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface SummaryItem {
  key: string;
  title: string;
  subtitle?: string;
}

withDefaults(
  defineProps<{
    items: SummaryItem[];
    icon?: string;
  }>(),
  { icon: "music-note-beamed" },
);

defineEmits<{ (e: "select", key: string): void }>();
</script>

<style scoped>
.grid-wrap {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.75rem;
  padding: 0.75rem;
}
.summary-card {
  background: var(--bs-body-bg);
  cursor: pointer;
}
.summary-card:hover {
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.1));
}
.summary-art {
  aspect-ratio: 1;
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.15));
  font-size: 1.5rem;
}
</style>
