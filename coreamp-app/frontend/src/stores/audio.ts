import { defineStore } from "pinia";
import type { EqBand, NativeDspSettings } from "@/types";
import * as api from "@/api/tauri";
import { useNotifyStore, errorMessage } from "@/stores/notify";

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
    // Push the current settings to the native engine. All mutators call this so
    // the audio path always matches the UI.
    async push(): Promise<void> {
      try {
        await api.nativeAudioSetDspSettings(this.dspSettings);
      } catch (err) {
        useNotifyStore().error(`DSP update failed: ${errorMessage(err)}`);
      }
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
