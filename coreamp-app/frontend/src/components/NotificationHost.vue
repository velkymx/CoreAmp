<template>
  <div class="notify-host" data-test="notify-host" aria-live="polite">
    <div v-if="notify.notes.length > 1" class="d-flex justify-content-end mb-1">
      <button
        type="button"
        class="notify-clear-all small"
        data-test="notify-clear-all"
        @click="notify.clear()"
      >
        Clear all
      </button>
    </div>
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
        v-if="note.kind === 'error'"
        type="button"
        class="btn-close-x"
        :aria-label="copiedId === note.id ? 'Copied' : 'Copy error'"
        data-test="notify-copy"
        @click="copy(note)"
      >
        {{ copiedId === note.id ? "✓" : "⧉" }}
      </button>
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
import { ref, watch, onBeforeUnmount } from "vue";
import { useNotifyStore, type Note, type NoteKind } from "@/stores/notify";

const AUTO_DISMISS_MS = 6000;

const notify = useNotifyStore();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const copiedId = ref<number | null>(null);

// Auto-dismiss info/success after a delay. Errors persist until the user
// dismisses them, so a failure is never silently lost off-screen.
watch(
  () => notify.notes.map((n) => n.id),
  (ids) => {
    for (const note of notify.notes) {
      if (timers.has(note.id) || note.kind === "error") continue;
      timers.set(
        note.id,
        setTimeout(() => {
          notify.dismiss(note.id);
          timers.delete(note.id);
        }, AUTO_DISMISS_MS),
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

// Copy an error's text to the clipboard (for bug reports), with a brief ✓.
async function copy(note: Note): Promise<void> {
  try {
    await navigator.clipboard?.writeText(note.text);
    copiedId.value = note.id;
    setTimeout(() => {
      if (copiedId.value === note.id) copiedId.value = null;
    }, 1500);
  } catch {
    // Clipboard unavailable (no permission / not a secure context): ignore.
  }
}

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
.notify-clear-all {
  pointer-events: auto;
  border: 0;
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.3));
  border-radius: 0.25rem;
  padding: 0.1rem 0.5rem;
  color: var(--bs-secondary-color, inherit);
  cursor: pointer;
}
</style>
