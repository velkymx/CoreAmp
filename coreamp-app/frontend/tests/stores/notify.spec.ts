import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotifyStore, errorMessage } from "@/stores/notify";

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
});

describe("errorMessage", () => {
  it("unwraps Error, string, and falls back to String()", () => {
    expect(errorMessage(new Error("nope"))).toBe("nope");
    expect(errorMessage("raw")).toBe("raw");
    expect(errorMessage(42)).toBe("42");
  });
});
