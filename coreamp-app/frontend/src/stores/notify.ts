import { defineStore } from "pinia";

export type NoteKind = "error" | "info" | "success";

export interface Note {
  id: number;
  kind: NoteKind;
  text: string;
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
      const id = nextId++;
      this.notes.push({ id, kind, text });
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
