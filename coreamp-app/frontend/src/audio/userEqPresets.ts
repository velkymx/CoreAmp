import type { EqBand } from "@/types";

export const EQ_PRESETS_KEY = "coreamp.eq.presets";

export interface UserEqPreset {
  name: string;
  bands: EqBand[];
}

export function loadUserEqPresets(): UserEqPreset[] {
  try {
    const raw = localStorage.getItem(EQ_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => typeof p?.name === "string" && Array.isArray(p?.bands),
    );
  } catch {
    return [];
  }
}

function persist(presets: UserEqPreset[]): UserEqPreset[] {
  try {
    localStorage.setItem(EQ_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* storage unavailable — return the in-memory list anyway */
  }
  return presets;
}

// Add or replace a preset by name, keeping the list sorted by name.
export function saveUserEqPreset(preset: UserEqPreset): UserEqPreset[] {
  const rest = loadUserEqPresets().filter((p) => p.name !== preset.name);
  rest.push(preset);
  rest.sort((a, b) => a.name.localeCompare(b.name));
  return persist(rest);
}

export function deleteUserEqPreset(name: string): UserEqPreset[] {
  return persist(loadUserEqPresets().filter((p) => p.name !== name));
}
