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
}));

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

  it("clearing history calls the backend", async () => {
    const w = mount(SettingsView, { global: { stubs } });
    await flushPromises();
    await w.get('[data-test="clear-history"]').trigger("click");
    expect(api.clearHistory).toHaveBeenCalledOnce();
  });
});
