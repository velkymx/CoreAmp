import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import {
  useNotifyStore,
  errorMessage,
  redactUserInfo,
} from "@/stores/notify";

describe("notify store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("pushes notes with unique ids and the given kind", () => {
    const n = useNotifyStore();
    const a = n.error("boom");
    const b = n.success("ok");
    expect(n.notes).toHaveLength(2);
    expect(n.notes[0]).toMatchObject({ id: a, kind: "error", text: "boom" });
    expect(n.notes[1]).toMatchObject({ id: b, kind: "success", text: "ok" });
    expect(a).not.toBe(b);
  });

  it("dismiss removes only the matching note", () => {
    const n = useNotifyStore();
    const a = n.info("a");
    n.info("b");
    n.dismiss(a);
    expect(n.notes.map((x) => x.text)).toEqual(["b"]);
  });

  it("clear empties all notes", () => {
    const n = useNotifyStore();
    n.error("x");
    n.clear();
    expect(n.notes).toHaveLength(0);
  });

  it("busy is ref-counted across overlapping pending operations", () => {
    const n = useNotifyStore();
    expect(n.busy).toBe(false);
    n.beginPending();
    n.beginPending();
    expect(n.busy).toBe(true);
    n.endPending();
    expect(n.busy).toBe(true); // one still in flight
    n.endPending();
    expect(n.busy).toBe(false);
  });

  it("endPending never drives the count negative", () => {
    const n = useNotifyStore();
    n.endPending();
    n.endPending();
    expect(n.pending).toBe(0);
    expect(n.busy).toBe(false);
  });

  describe("dedupe", () => {
    it("drops an identical note fired within the 2s window", () => {
      vi.useFakeTimers();
      try {
        const n = useNotifyStore();
        const a = n.error("scan failed");
        const b = n.error("scan failed");
        expect(b).toBe(a);
        expect(n.notes).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("accepts the same note again after the window expires", () => {
      vi.useFakeTimers();
      try {
        const n = useNotifyStore();
        n.error("scan failed");
        vi.advanceTimersByTime(2_500);
        n.error("scan failed");
        expect(n.notes).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not dedupe across different kinds", () => {
      vi.useFakeTimers();
      try {
        const n = useNotifyStore();
        n.error("oops");
        n.info("oops");
        expect(n.notes).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not dedupe across different texts", () => {
      vi.useFakeTimers();
      try {
        const n = useNotifyStore();
        n.error("oops A");
        n.error("oops B");
        expect(n.notes).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("errorMessage", () => {
  it("unwraps Error, string, and falls back to String()", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
    expect(errorMessage("raw")).toBe("raw");
    expect(errorMessage(42)).toBe("42");
  });

  it("redacts user paths from Error messages", () => {
    const err = new Error("read /Users/alice/Music/track.mp3: not found");
    expect(errorMessage(err)).not.toContain("alice");
    expect(errorMessage(err)).toContain("<HOME>");
    expect(errorMessage(err)).toContain("Music/track.mp3");
  });

  it("strips top-level database / io error prefixes; keeps the rest", () => {
    expect(errorMessage("database error: no such column: artist")).toBe(
      "no such column: artist",
    );
    expect(errorMessage("io error: permission denied")).toBe(
      "permission denied",
    );
  });
});

describe("redactUserInfo", () => {
  it("redacts /Users/<name> paths but keeps the rest", () => {
    expect(redactUserInfo("open /Users/alice/Music/track.mp3")).toBe(
      "open <HOME>/Music/track.mp3",
    );
  });

  it("redacts /home/<name> paths", () => {
    expect(redactUserInfo("read /home/bob/Music/x.flac")).toBe(
      "read <HOME>/Music/x.flac",
    );
  });

  it("redacts /root paths but keeps the rest", () => {
    expect(redactUserInfo("/root/.config/CoreAmp/local.db")).toBe(
      "<HOME>/.config/CoreAmp/local.db",
    );
  });

  it("redacts ~/tilde paths", () => {
    expect(redactUserInfo("open ~/Music/foo.mp3")).toBe(
      "open <HOME>/Music/foo.mp3",
    );
  });

  it("strips database error: / io error: prefixes", () => {
    expect(redactUserInfo("database error: disk full")).toBe("disk full");
    expect(redactUserInfo("io error: permission denied")).toBe(
      "permission denied",
    );
  });

  it("leaves the sub-error context intact", () => {
    // Sub-errors ("no such column: artist", "UNIQUE constraint failed:")
    // are useful for the user; we do not strip them.
    expect(redactUserInfo("no such column: artist")).toBe("no such column: artist");
    expect(redactUserInfo("UNIQUE constraint failed: files.path")).toBe(
      "UNIQUE constraint failed: files.path",
    );
  });

  it("leaves ordinary messages alone", () => {
    expect(redactUserInfo("network timeout")).toBe("network timeout");
    expect(redactUserInfo("permission denied")).toBe("permission denied");
  });
});
