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

/**
 * Strip user-identifying information from a backend error string
 * before it surfaces in a toast. The raw string is still available
 * in the browser console (via `app.config.errorHandler` and the
 * `unhandledrejection` listener), so developers can still see
 * paths and SQL fragments — but the user only ever sees a
 * sanitized version.
 *
 * Currently redacts:
 * - macOS home paths (`/Users/<name>/...`)
 * - Linux home paths (`/home/<name>/...`)
 * - Tilde paths (`~/...`)
 * - SQLite / Rust error prefixes (`database error:`, `io error:`,
 *   `no such column:`, `UNIQUE constraint failed:`, `database is locked`)
 *
 * The redactions are conservative — they only target well-known
 * shapes so a user-pasted path or a normal message that happens to
 * contain the substring "database" is left alone.
 */
export function redactUserInfo(message: string): string {
  let out = message;
  // macOS / Linux home dirs. POSIX requires a username component
  // under /Users and /home; we capture only the parent (no trailing
  // slash) so the separator survives. /root is handled separately
  // because it has no username component.
  out = out.replace(/\/(?:Users|home)\/[^/\s'")\]]+/g, "<HOME>");
  out = out.replace(/\/root(?=\/|$|\s|'|"|\)|])/g, "<HOME>");
  // Tilde paths: ~/foo/bar -> <HOME>/foo/bar.
  out = out.replace(/(^|[\s'"(=])~[^/\s'")\.]*/g, "$1<HOME>");
  // Top-level Rust error wrappers from coreamp-common's CoreampError
  // Display impl. The sub-message ("no such column: artist", etc.)
  // stays; the prefix is what leaks the file path / DB internals.
  out = out.replace(/\b(?:database error|io error):\s*/gi, "");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out || message; // fall back if we redacted everything
}

// Pull a human-readable message out of whatever was thrown.
export function errorMessage(err: unknown): string {
  let raw: string;
  if (err instanceof Error) raw = err.message;
  else if (typeof err === "string") raw = err;
  else {
    try {
      raw = String(err);
    } catch {
      raw = "Unknown error";
    }
  }
  return redactUserInfo(raw);
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
