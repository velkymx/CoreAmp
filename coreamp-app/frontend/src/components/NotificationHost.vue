<template>
  <div class="notify-host" data-test="notify-host" aria-live="polite">
    <div
      v-for="note in notify.notes"
      :key="note.id"
      class="notify-toast shadow-sm rounded px-3 py-2 mb-2 d-flex align-items-start gap-2"
      :class="kindClass(note.kind)"
      data-test="notify-toast"
      role="status"
    >
      <VibeIcon :icon="kindIcon(note.kind)" />
      <span class="flex-grow-1 small">{{ note.text }}</span>
      <button
        type="button"
        class="btn-close-x"
        aria-label="Dismiss"
        data-test="notify-dismiss"
        @click="notify.dismiss(note.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, onBeforeUnmount } from "vue";
import { useNotifyStore, type NoteKind } from "@/stores/notify";

const AUTO_DISMISS_MS = 6000;

const notify = useNotifyStore();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

// Auto-dismiss each new note after a delay. Errors stick around longer so they
// aren't missed.
watch(
  () => notify.notes.map((n) => n.id),
  (ids) => {
    for (const note of notify.notes) {
      if (timers.has(note.id)) continue;
      const ttl = note.kind === "error" ? AUTO_DISMISS_MS * 2 : AUTO_DISMISS_MS;
      timers.set(
        note.id,
        setTimeout(() => {
          notify.dismiss(note.id);
          timers.delete(note.id);
        }, ttl),
      );
    }
    // Drop timers for notes already gone.
    for (const id of [...timers.keys()]) {
      if (!ids.includes(id)) {
        clearTimeout(timers.get(id));
        timers.delete(id);
      }
    }
  },
  { deep: true },
);

onBeforeUnmount(() => {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
});

function kindClass(kind: NoteKind): string {
  return kind === "error"
    ? "notify-error"
    : kind === "success"
      ? "notify-success"
      : "notify-info";
}

function kindIcon(kind: NoteKind): string {
  return kind === "error"
    ? "exclamation-triangle-fill"
    : kind === "success"
      ? "check-circle-fill"
      : "info-circle-fill";
}
</script>

<style scoped>
.notify-host {
  position: fixed;
  right: 1rem;
  bottom: 5.5rem;
  z-index: 1080;
  width: min(24rem, 90vw);
  pointer-events: none;
}
.notify-toast {
  pointer-events: auto;
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.3));
}
.notify-error {
  border-left: 4px solid var(--bs-danger, #dc3545);
}
.notify-success {
  border-left: 4px solid var(--bs-success, #198754);
}
.notify-info {
  border-left: 4px solid var(--bs-info, #0dcaf0);
}
.btn-close-x {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}
</style>
