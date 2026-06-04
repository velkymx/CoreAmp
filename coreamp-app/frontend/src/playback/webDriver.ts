// Thin adapter over a single HTMLAudioElement. The store calls this for the
// 'web' source; tests mock this module so decision logic stays deterministic.
import { convertFileSrc } from "@tauri-apps/api/core";

let el: HTMLAudioElement | null = null;
let loadedPath: string | null = null;

// Web Audio graph: source → preamp → EQ biquads → analyser → destination.
// Built lazily on first playback. The EQ biquads actually shape the sound
// (peaking filters), and the analyser feeds the visualizer + EQ graph.
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
let preampNode: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
// Master volume. Once the element is routed through Web Audio, HTMLAudioElement
// .volume no longer affects output — output level must be set on a GainNode.
let masterGain: GainNode | null = null;
let lastVolume = 1;

interface EqSettings {
  eq_enabled: boolean;
  eq_bands: { frequency: number; gain: number; q: number }[];
  preamp_db: number;
}
let pendingEq: EqSettings | null = null;

function audio(): HTMLAudioElement {
  if (!el) el = new Audio();
  el.crossOrigin = "anonymous";
  return el;
}

function ensureGraph(): void {
  if (analyser || typeof AudioContext === "undefined") return;
  try {
    ctx = new AudioContext();
    sourceNode = ctx.createMediaElementSource(audio());
    preampNode = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    // Chain: source → preamp → b0 … b4 → analyser → destination.
    let node: AudioNode = sourceNode;
    node.connect(preampNode);
    node = preampNode;
    eqNodes = [];
    for (let i = 0; i < 5; i++) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = "peaking";
      biquad.frequency.value = 1000;
      biquad.Q.value = 1;
      biquad.gain.value = 0;
      node.connect(biquad);
      node = biquad;
      eqNodes.push(biquad);
    }
    node.connect(analyser);
    masterGain = ctx.createGain();
    masterGain.gain.value = lastVolume;
    analyser.connect(masterGain);
    masterGain.connect(ctx.destination);

    if (pendingEq) applyEqInternal(pendingEq);
  } catch {
    analyser = null;
  }
}

// Apply EQ settings to the live biquad chain. When the EQ is bypassed the band
// gains drop to 0 (flat) but the preamp still applies.
function applyEqInternal(settings: EqSettings): void {
  if (!preampNode) return;
  preampNode.gain.value = Math.pow(10, settings.preamp_db / 20);
  for (let i = 0; i < eqNodes.length; i++) {
    const band = settings.eq_bands[i];
    const node = eqNodes[i];
    if (!band) continue;
    node.frequency.value = band.frequency;
    node.Q.value = band.q;
    node.gain.value = settings.eq_enabled ? band.gain : 0;
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
  // Build the audio graph now (without waiting for first playback) so visual
  // engines like butterchurn have an AudioContext + node to attach to.
  ensureGraph(): void {
    ensureGraph();
  },
  // The AudioContext backing the graph (null until built / unavailable).
  getAudioContext(): AudioContext | null {
    return ctx;
  },
  // A node carrying the program audio, for external visualizers to tap.
  getVizSource(): AudioNode | null {
    return preampNode;
  },
  // Live frequency analyser for the visualizer (null until web playback has
  // started, or when Web Audio is unavailable).
  getAnalyser(): AnalyserNode | null {
    return analyser;
  },
  // Apply EQ + preamp to the audio. Stored and re-applied once the graph is
  // built if it isn't yet (settings can arrive before first playback).
  applyEq(settings: EqSettings): void {
    pendingEq = settings;
    if (analyser) applyEqInternal(settings);
  },
  position(): number {
    return audio().currentTime;
  },
  duration(): number {
    const d = audio().duration;
    return Number.isFinite(d) ? d : 0;
  },
  // True when the current track has played to the end (drives queue advance).
  hasEnded(): boolean {
    return audio().ended;
  },
  seek(secs: number): void {
    audio().currentTime = secs;
  },
  setVolume(level: number): void {
    lastVolume = level;
    // Master GainNode controls output once the graph exists; before that, the
    // element's own volume applies.
    if (masterGain) masterGain.gain.value = level;
    else audio().volume = level;
  },
};

export type WebDriver = typeof webDriver;
