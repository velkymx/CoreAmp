// Selectable display styles for the AudioMotion EQ visualizer. Each maps to a
// set of AudioMotion-Analyzer options; kept pure so the mapping is testable.
export type AudioMotionMode = "bars" | "led" | "round" | "radial" | "lumi";

export interface AudioMotionModeOptions {
  mode: number;
  ledBars: boolean;
  lumiBars: boolean;
  roundBars: boolean;
  radial: boolean;
  reflexRatio: number;
}

const MODE_OPTIONS: Record<AudioMotionMode, AudioMotionModeOptions> = {
  bars: { mode: 6, ledBars: false, lumiBars: false, roundBars: false, radial: false, reflexRatio: 0.25 },
  led: { mode: 6, ledBars: true, lumiBars: false, roundBars: false, radial: false, reflexRatio: 0 },
  round: { mode: 6, ledBars: false, lumiBars: false, roundBars: true, radial: false, reflexRatio: 0.4 },
  radial: { mode: 6, ledBars: false, lumiBars: false, roundBars: false, radial: true, reflexRatio: 0 },
  lumi: { mode: 6, ledBars: false, lumiBars: true, roundBars: false, radial: false, reflexRatio: 0.3 },
};

export const AUDIOMOTION_MODES: { value: AudioMotionMode; text: string }[] = [
  { value: "bars", text: "Bars" },
  { value: "led", text: "LED Bars" },
  { value: "round", text: "Round + Reflect" },
  { value: "radial", text: "Radial" },
  { value: "lumi", text: "LumiBars" },
];

export function audioMotionOptions(mode: AudioMotionMode): AudioMotionModeOptions {
  return { ...(MODE_OPTIONS[mode] ?? MODE_OPTIONS.bars) };
}

const STORAGE_KEY = "coreamp.audiomotion.mode";

export function loadAudioMotionMode(): AudioMotionMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && v in MODE_OPTIONS) return v as AudioMotionMode;
  } catch {
    /* storage unavailable */
  }
  return "bars";
}

export function persistAudioMotionMode(mode: AudioMotionMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* best-effort */
  }
}
