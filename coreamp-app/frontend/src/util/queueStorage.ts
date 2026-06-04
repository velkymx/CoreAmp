import type { Track } from "@/types";

// Persisted across sessions so the queue (and where you were in it) survives a
// restart. Versioned so a future shape change can be ignored rather than
// mis-parsed.
export const QUEUE_STORAGE_KEY = "coreamp.queue.v1";

export interface PersistedQueue {
  queue: Track[];
  currentIndex: number;
}

// Cheap change signature so the 4-per-second status ticks don't rewrite
// localStorage when only playback position moved.
let lastSignature = "";

function signature(queue: Track[], currentIndex: number): string {
  return `${currentIndex}|${queue.map((t) => t.path).join("\n")}`;
}

export function persistQueue(queue: Track[], currentIndex: number): void {
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({ queue, currentIndex }));
    lastSignature = signature(queue, currentIndex);
  } catch {
    // Storage disabled or full: remembering the queue is best-effort.
  }
}

// Persist only when the queue contents or the current index actually changed.
export function persistQueueIfChanged(queue: Track[], currentIndex: number): void {
  const sig = signature(queue, currentIndex);
  if (sig === lastSignature) return;
  persistQueue(queue, currentIndex);
}

export function restoreQueue(): PersistedQueue | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(QUEUE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedQueue>;
    if (!parsed || !Array.isArray(parsed.queue)) return null;
    const queue = parsed.queue;
    let currentIndex = Number.isInteger(parsed.currentIndex)
      ? (parsed.currentIndex as number)
      : -1;
    if (queue.length === 0) {
      currentIndex = -1;
    } else if (currentIndex >= 0) {
      currentIndex = Math.min(currentIndex, queue.length - 1);
    }
    lastSignature = signature(queue, currentIndex);
    return { queue, currentIndex };
  } catch {
    return null;
  }
}
