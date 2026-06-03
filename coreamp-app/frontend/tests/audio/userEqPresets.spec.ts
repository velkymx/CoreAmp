import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadUserEqPresets,
  saveUserEqPreset,
  deleteUserEqPreset,
  EQ_PRESETS_KEY,
} from "@/audio/userEqPresets";
import type { EqBand } from "@/types";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

const bands = (gain: number): EqBand[] => [{ frequency: 60, gain, q: 1 }];

describe("userEqPresets", () => {
  beforeEach(() => vi.stubGlobal("localStorage", memoryStorage()));

  it("starts empty", () => {
    expect(loadUserEqPresets()).toEqual([]);
  });

  it("saves a preset and reloads it", () => {
    saveUserEqPreset({ name: "Mine", bands: bands(6) });
    const loaded = loadUserEqPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].name).toBe("Mine");
    expect(loaded[0].bands[0].gain).toBe(6);
  });

  it("replaces a preset with the same name", () => {
    saveUserEqPreset({ name: "Mine", bands: bands(6) });
    const after = saveUserEqPreset({ name: "Mine", bands: bands(-3) });
    expect(after).toHaveLength(1);
    expect(after[0].bands[0].gain).toBe(-3);
  });

  it("deletes by name", () => {
    saveUserEqPreset({ name: "A", bands: bands(1) });
    saveUserEqPreset({ name: "B", bands: bands(2) });
    const after = deleteUserEqPreset("A");
    expect(after.map((p) => p.name)).toEqual(["B"]);
  });

  it("survives corrupt storage", () => {
    localStorage.setItem(EQ_PRESETS_KEY, "{bad json");
    expect(loadUserEqPresets()).toEqual([]);
    expect(() => saveUserEqPreset({ name: "X", bands: bands(0) })).not.toThrow();
  });
});
