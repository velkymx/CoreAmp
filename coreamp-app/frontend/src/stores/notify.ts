import { defineStore } from "pinia";

export type NoteKind = "error" | "info" | "success";

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
  // Unix-ms timestamp of when the note was created. Used for the
  // dedupe window so the same error fired in a tight loop (e.g. a
  // failed scan running every 30s) does not stack 20 identical
  // toasts on the user.
  createdAt: number;
}

// Pull a human-readable message out of whatever was thrown.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return String(err);
  } catch {
    return "Unknown error";
  }
}

let nextId = 1;

// Two identical notes within this window are deduped to one. 2s is
// long enough that a single transient failure produces one toast, but
// short enough that a fresh "scan failed" after a network hiccup
// still surfaces.
const DEDUPE_WINDOW_MS = 2_000;

export const useNotifyStore = defineStore("notify", {
  state: (): { notes: Note[]; pending: number } => ({ notes: [], pending: 0 }),
  getters: {
    // True while one or more tracked async operations are in flight.
    busy: (state): boolean => state.pending > 0,
  },
  actions: {
    // Ref-counted so overlapping operations keep the busy state until the last
    // one settles.
    beginPending(): void {
      this.pending += 1;
    },
    endPending(): void {
      if (this.pending > 0) this.pending -= 1;
    },
    push(kind: NoteKind, text: string): number {
      // Dedupe: a tight loop of identical errors (e.g. a failing
      // background scan firing every tick) used to stack identical
      // toasts. If we already have a note of the same kind + same
      // text within the dedupe window, drop the new one.
      const now = Date.now();
      const dup = this.notes.find(
        (n) =>
          n.kind === kind &&
          n.text === text &&
          now - n.createdAt < DEDUPE_WINDOW_MS,
      );
      if (dup) {
        return dup.id;
      }
      const id = nextId++;
      this.notes.push({ id, kind, text, createdAt: now });
      return id;
    },
    error(text: string): number {
      return this.push("error", text);
    },
    info(text: string): number {
      return this.push("info", text);
    },
    success(text: string): number {
      return this.push("success", text);
    },
    dismiss(id: number): void {
      this.notes = this.notes.filter((n) => n.id !== id);
    },
    clear(): void {
      this.notes = [];
    },
  },
});
