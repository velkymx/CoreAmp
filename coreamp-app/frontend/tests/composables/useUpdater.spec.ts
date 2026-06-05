import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const check = vi.fn();
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => check() }));

const restartApp = vi.fn().mockResolvedValue(undefined);
vi.mock("@/api/tauri", () => ({ restartApp: () => restartApp() }));

import { useUpdater } from "@/composables/useUpdater";

describe("useUpdater", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("reports no update when check returns null", async () => {
    check.mockResolvedValue(null);
    const u = useUpdater();
    await u.checkForUpdate();
    expect(u.status.value).toBe("none");
    expect(u.version.value).toBeNull();
  });

  it("surfaces an available update's version and notes", async () => {
    check.mockResolvedValue({ version: "1.2.3", body: "Bug fixes", downloadAndInstall: vi.fn() });
    const u = useUpdater();
    await u.checkForUpdate();
    expect(u.status.value).toBe("available");
    expect(u.version.value).toBe("1.2.3");
    expect(u.notes.value).toBe("Bug fixes");
  });

  it("reports an error when the check throws", async () => {
    check.mockRejectedValue(new Error("offline"));
    const u = useUpdater();
    await u.checkForUpdate();
    expect(u.status.value).toBe("error");
    expect(u.error.value).toBe("offline");
  });

  it("downloads with progress then relaunches", async () => {
    const downloadAndInstall = vi.fn(async (cb: (e: unknown) => void) => {
      cb({ event: "Started", data: { contentLength: 100 } });
      cb({ event: "Progress", data: { chunkLength: 50 } });
      cb({ event: "Progress", data: { chunkLength: 50 } });
      cb({ event: "Finished" });
    });
    check.mockResolvedValue({ version: "1.2.3", body: null, downloadAndInstall });
    const u = useUpdater();
    await u.checkForUpdate();
    await u.installUpdate();
    expect(downloadAndInstall).toHaveBeenCalledOnce();
    expect(u.progress.value).toBe(1);
    expect(restartApp).toHaveBeenCalledOnce();
  });

  it("install is a no-op when no update is pending", async () => {
    const u = useUpdater();
    await u.installUpdate();
    expect(restartApp).not.toHaveBeenCalled();
  });
});
