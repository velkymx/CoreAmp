import { describe, it, expect, beforeEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SettingsView from "@/components/SettingsView.vue";
import * as api from "@/api/tauri";

vi.mock("@/api/tauri", () => ({
  getSettings: vi.fn().mockResolvedValue({ scan_interval_secs: 600, api_proxy: null }),
  appVersion: vi.fn().mockResolvedValue("0.4.0"),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  scanLibrary: vi
    .fn()
    .mockResolvedValue({ roots: [], roots_scanned: 1, files_discovered: 10, files_upserted: 3 }),
  scanPaths: vi
    .fn()
    .mockResolvedValue({ roots: [], roots_scanned: 2, files_discovered: 5, files_upserted: 5 }),
  pickScanPaths: vi.fn().mockResolvedValue([]),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  restartApp: vi.fn().mockResolvedValue(undefined),
}));

const updaterCheck = vi.fn().mockResolvedValue(null);
vi.mock("@tauri-apps/plugin-updater", () => ({ check: () => updaterCheck() }));

const stubs = {
  VibeFormInput: {
    props: ["modelValue", "type"],
    emits: ["update:modelValue"],
    template:
      '<input :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  VibeButton: { template: "<button><slot/></button>" },
};

describe("SettingsView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads current settings and the app version on mount", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    expect((w.get('[data-test="scan-interval"]').element as HTMLInputElement).value).toBe("600");
    expect(w.text()).toContain("0.4.0");
  });

  it("saving forwards interval + proxy, mapping blank proxy to null", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="scan-interval"]').setValue("300");
    await w.get('[data-test="settings-save"]').trigger("click");
    expect(api.saveSettings).toHaveBeenCalledWith(300, null);
  });

  it("rejects a non-positive interval without calling the backend", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="scan-interval"]').setValue("0");
    await w.get('[data-test="settings-save"]').trigger("click");
    expect(api.saveSettings).not.toHaveBeenCalled();
    expect(w.get('[data-test="settings-status"]').text()).toContain("positive");
  });

  it("scanning reports the result", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="scan-library"]').trigger("click");
    await flushPromises();
    expect(api.scanLibrary).toHaveBeenCalledOnce();
    expect(w.get('[data-test="settings-status"]').text()).toContain("3 of 10");
  });

  it("choosing files imports the picked paths and reports the result", async () => {
    vi.mocked(api.pickScanPaths).mockResolvedValue(["/m/a.mp3", "/m/b.mp3"]);
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="choose-files"]').trigger("click");
    await flushPromises();
    expect(api.pickScanPaths).toHaveBeenCalledWith("file");
    expect(api.scanPaths).toHaveBeenCalledWith(["/m/a.mp3", "/m/b.mp3"]);
    expect(w.get('[data-test="settings-status"]').text()).toContain("5 of 2");
  });

  it("choosing files does nothing when the picker is cancelled", async () => {
    vi.mocked(api.pickScanPaths).mockResolvedValue([]);
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="choose-files"]').trigger("click");
    await flushPromises();
    expect(api.scanPaths).not.toHaveBeenCalled();
  });

  it("importing an explicit path scans it and clears the field", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="import-path"]').setValue("/music/album");
    await w.get('[data-test="import-path-go"]').trigger("click");
    await flushPromises();
    expect(api.scanPaths).toHaveBeenCalledWith(["/music/album"]);
    expect((w.get('[data-test="import-path"]').element as HTMLInputElement).value).toBe("");
  });

  it("dropping files/folders imports the dropped paths", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await (
      w.vm as unknown as { importDropped: (p: string[]) => Promise<void> }
    ).importDropped(["/music/a.mp3", "/music/folder"]);
    await flushPromises();
    expect(api.scanPaths).toHaveBeenCalledWith(["/music/a.mp3", "/music/folder"]);
    expect(w.get('[data-test="settings-status"]').text()).toContain("2 dropped item");
  });

  it("dropping nothing is a no-op", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await (
      w.vm as unknown as { importDropped: (p: string[]) => Promise<void> }
    ).importDropped([]);
    expect(api.scanPaths).not.toHaveBeenCalled();
  });

  it("shows a spinner while a scan is in flight and hides it when done", async () => {
    let resolveScan!: (v: unknown) => void;
    vi.mocked(api.scanLibrary).mockReturnValue(
      new Promise((r) => {
        resolveScan = r;
      }) as never,
    );
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="scan-library"]').trigger("click");
    await w.vm.$nextTick();
    expect(w.find('[data-test="import-spinner"]').exists()).toBe(true);

    resolveScan({ roots: [], roots_scanned: 1, files_discovered: 1, files_upserted: 1 });
    await flushPromises();
    expect(w.find('[data-test="import-spinner"]').exists()).toBe(false);
  });

  it("checking for updates reports up-to-date when none is available", async () => {
    updaterCheck.mockResolvedValue(null);
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="check-update"]').trigger("click");
    await flushPromises();
    expect(updaterCheck).toHaveBeenCalled();
    expect(w.get('[data-test="update-status"]').text()).toContain("up to date");
  });

  it("shows an available update with an install button", async () => {
    updaterCheck.mockResolvedValue({ version: "9.9.9", body: "notes", downloadAndInstall: vi.fn() });
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="check-update"]').trigger("click");
    await flushPromises();
    expect(w.find('[data-test="update-available"]').exists()).toBe(true);
    expect(w.get('[data-test="update-available"]').text()).toContain("9.9.9");
    expect(w.find('[data-test="install-update"]').exists()).toBe(true);
  });

  it("clearing history calls the backend", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="clear-history"]').trigger("click");
    expect(api.clearHistory).toHaveBeenCalledOnce();
  });
});
