import { describe, it, expect, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useNotify } from "@/composables/useNotify";
import { useNotifyStore } from "@/stores/notify";

describe("useNotify.run", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("marks busy while running and clears after success", async () => {
    const notify = useNotifyStore();
    const { run } = useNotify();
    let resolve!: (v: string) => void;
    const pending = new Promise<string>((r) => {
      resolve = r;
    });
    const op = run(() => pending, { success: "done" });
    expect(notify.busy).toBe(true);
    resolve("ok");
    expect(await op).toBe("ok");
    expect(notify.busy).toBe(false);
    expect(notify.notes.at(-1)).toMatchObject({ kind: "success", text: "done" });
  });

  it("clears busy and reports the error when the op throws", async () => {
    const notify = useNotifyStore();
    const { run } = useNotify();
    const result = await run(() => Promise.reject(new Error("boom")), {
      errorPrefix: "Failed",
    });
    expect(result).toBeUndefined();
    expect(notify.busy).toBe(false);
    expect(notify.notes.at(-1)).toMatchObject({ kind: "error", text: "Failed: boom" });
  });
});
