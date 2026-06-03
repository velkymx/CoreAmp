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
  state: (): { notes: Note[] } => ({ notes: [] }),
  actions: {
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
