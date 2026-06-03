// Thin adapter over a single HTMLAudioElement. The store calls this for the
// 'web' source; tests mock this module so decision logic stays deterministic.
import { convertFileSrc } from "@tauri-apps/api/core";

let el: HTMLAudioElement | null = null;
let loadedPath: string | null = null;

// Web Audio graph for visualization. Built lazily the first time playback
// starts so the visualizer can read live frequency data from the element.
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;

function audio(): HTMLAudioElement {
  if (!el) el = new Audio();
  el.crossOrigin = "anonymous";
  return el;
}

// Build (once) the AudioContext → MediaElementSource → Analyser → destination
// graph. Guarded so it is a harmless no-op where Web Audio is unavailable
// (jsdom tests). Audio still reaches the speakers through the destination.
function ensureGraph(): void {
  if (analyser || typeof AudioContext === "undefined") return;
  try {
    ctx = new AudioContext();
    sourceNode = ctx.createMediaElementSource(audio());
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    sourceNode.connect(analyser);
    analyser.connect(ctx.destination);
  } catch {
    analyser = null;
  }
}

export const webDriver = {
  // Point the element at a local file path, resolved through Tauri's asset
  // protocol so the webview is allowed to read it. No-op if already loaded.
  load(path: string): void {
    if (loadedPath === path) return;
    audio().src = convertFileSrc(path);
    loadedPath = path;
  },
  isLoaded(): boolean {
    return Boolean(audio().src);
  },
  isPaused(): boolean {
    return audio().paused;
  },
  pause(): void {
    audio().pause();
  },
  async resume(): Promise<void> {
    ensureGraph();
    if (ctx && ctx.state === "suspended") await ctx.resume();
    await audio().play();
  },
  // Live frequency analyser for the visualizer (null until web playback has
  // started, or when Web Audio is unavailable).
  getAnalyser(): AnalyserNode | null {
    return analyser;
  },
  position(): number {
    return audio().currentTime;
  },
  duration(): number {
    const d = audio().duration;
    return Number.isFinite(d) ? d : 0;
  },
  seek(secs: number): void {
    audio().currentTime = secs;
  },
  setVolume(level: number): void {
    audio().volume = level;
  },
};

export type WebDriver = typeof webDriver;
