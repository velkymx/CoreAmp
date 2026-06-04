import { defineStore } from "pinia";
import type { EqBand, NativeDspSettings } from "@/types";
import { webDriver } from "@/playback/webDriver";
import {
  loadUserEqPresets,
  saveUserEqPreset,
  deleteUserEqPreset,
  type UserEqPreset,
} from "@/audio/userEqPresets";
import { EQ_FREQUENCIES } from "@/audio/eqFrequencies";

// 10-band graphic EQ. Only gain/Q are user-adjustable; centre frequencies are
// the fixed ISO octave bands (see eqFrequencies.ts).
export { EQ_FREQUENCIES };

export type EqPresetName =
  | "Flat"
  | "Warm"
  | "Presence"
  | "V Curve"
  | "Bass Cut"
  | "Hip-Hop"
  | "Dance";

// Per-band gain (dB) for each named preset, in EQ_FREQUENCIES order
// (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k).
const PRESET_GAINS: Record<EqPresetName, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Warm: [5, 5, 4, 2, 0, -1, -2, -3, -4, -4],
  Presence: [-1, -1, 0, 0, 1, 2, 3, 4, 3, 2],
  "V Curve": [6, 5, 3, 0, -3, -3, 0, 3, 5, 6],
  "Bass Cut": [-10, -8, -5, -2, 0, 0, 0, 0, 0, 0],
  "Hip-Hop": [7, 7, 5, 3, 1, 0, 1, 2, 2, 3],
  Dance: [6, 5, 3, 1, -1, 0, 2, 3, 4, 5],
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
