import { defineStore } from "pinia";
import type { EqBand, NativeDspSettings } from "@/types";
import { webDriver } from "@/playback/webDriver";
import {
  loadUserEqPresets,
  saveUserEqPreset,
  deleteUserEqPreset,
  type UserEqPreset,
} from "@/audio/userEqPresets";

// Fixed 5-band layout. Only gain/Q are user-adjustable; the centre frequencies
// are conventional for a 5-band graphic EQ.
export const EQ_FREQUENCIES = [60, 230, 910, 3600, 14000] as const;

export type EqPresetName = "Flat" | "Warm" | "Presence" | "V Curve" | "Bass Cut";

// Per-band gain (dB) for each named preset, in EQ_FREQUENCIES order.
const PRESET_GAINS: Record<EqPresetName, number[]> = {
  Flat: [0, 0, 0, 0, 0],
  Warm: [5, 3, 0, -2, -4],
  Presence: [-1, 0, 2, 4, 3],
  "V Curve": [6, 2, -3, 2, 6],
  "Bass Cut": [-8, -3, 0, 0, 0],
};

export const BOOST_LABELS = ["Boost Off", "Boost+", "Boost++"] as const;

function defaultBands(): EqBand[] {
  return EQ_FREQUENCIES.map((frequency) => ({ frequency, gain: 0, q: 1.0 }));
}

interface AudioState {
  eqEnabled: boolean;
  bands: EqBand[];
  preset: EqPresetName;
  boostLevel: number;
  preampDb: number;
  limiterEnabled: boolean;
  crossfeedEnabled: boolean;
  userPresets: UserEqPreset[];
}

export const useAudioStore = defineStore("audio", {
  state: (): AudioState => ({
    eqEnabled: false,
    bands: defaultBands(),
    preset: "Flat",
    boostLevel: 0,
    preampDb: 0,
    limiterEnabled: true,
    crossfeedEnabled: false,
    userPresets: loadUserEqPresets(),
  }),
  getters: {
    boostLabel: (state) => BOOST_LABELS[state.boostLevel] ?? BOOST_LABELS[0],
    // The exact payload pushed to the native DSP chain.
    dspSettings: (state): NativeDspSettings => ({
      eq_enabled: state.eqEnabled,
      eq_bands: state.bands.map((b) => ({ ...b })),
      boost_level: state.boostLevel,
      preamp_db: state.preampDb,
      limiter_enabled: state.limiterEnabled,
      crossfeed_enabled: state.crossfeedEnabled,
    }),
  },
  actions: {
    // Apply the current settings to the Web Audio EQ chain so the sound matches
    // the UI. Synchronous (no IPC); kept async so callers/await stay unchanged.
    async push(): Promise<void> {
      webDriver.applyEq(this.dspSettings);
    },

    async setEqEnabled(enabled: boolean): Promise<void> {
      this.eqEnabled = enabled;
      await this.push();
    },

    async setBandGain(index: number, gain: number): Promise<void> {
      const band = this.bands[index];
      if (!band) return;
      band.gain = clamp(gain, -24, 24);
      this.preset = "Flat"; // a manual edit is no longer a named preset
      await this.push();
    },

    async setBandQ(index: number, q: number): Promise<void> {
      const band = this.bands[index];
      if (!band) return;
      band.q = clamp(q, 0.1, 12);
      await this.push();
    },

    async applyPreset(name: EqPresetName): Promise<void> {
      const gains = PRESET_GAINS[name];
      this.bands = EQ_FREQUENCIES.map((frequency, i) => ({
        frequency,
        gain: gains[i],
        q: 1.0,
      }));
      this.preset = name;
      this.eqEnabled = true;
      await this.push();
    },

    // Save the current bands as a named user preset (replacing one of the same
    // name), persisted to localStorage.
    saveUserPreset(name: string): void {
      const trimmed = name.trim();
      if (!trimmed) return;
      this.userPresets = saveUserEqPreset({
        name: trimmed,
        bands: this.bands.map((b) => ({ ...b })),
      });
    },

    deleteUserPreset(name: string): void {
      this.userPresets = deleteUserEqPreset(name);
    },

    async applyUserPreset(name: string): Promise<void> {
      const preset = this.userPresets.find((p) => p.name === name);
      if (!preset) return;
      this.bands = preset.bands.map((b) => ({ ...b }));
      this.preset = "Flat"; // not one of the built-in named presets
      this.eqEnabled = true;
      await this.push();
    },

    // Cycle Boost Off -> Boost+ -> Boost++ -> Off.
    async cycleBoost(): Promise<void> {
      this.boostLevel = (this.boostLevel + 1) % BOOST_LABELS.length;
      await this.push();
    },

    async setPreamp(db: number): Promise<void> {
      this.preampDb = clamp(db, -18, 18);
      await this.push();
    },

    async setLimiter(enabled: boolean): Promise<void> {
      this.limiterEnabled = enabled;
      await this.push();
    },

    async setCrossfeed(enabled: boolean): Promise<void> {
      this.crossfeedEnabled = enabled;
      await this.push();
    },
  },
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
