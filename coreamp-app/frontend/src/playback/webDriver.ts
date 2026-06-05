// Adapter over a pair of HTMLAudioElements ("decks") feeding one Web Audio
// graph. The active deck plays; the inactive deck can preload the next track so
// gapless playback swaps to an already-buffered element instead of loading on
// end-of-track. The store calls this for the 'web' source; tests mock this
// module so decision logic stays deterministic.
import { convertFileSrc } from "@tauri-apps/api/core";
import { replayGainMultiplier } from "@/util/gain";
import { EQ_FREQUENCIES } from "@/audio/eqFrequencies";

interface Deck {
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  // Per-deck gain so two decks can crossfade independently (source → gain →
  // preamp). The active deck sits at 1, the idle deck at 0.
  gain: GainNode | null;
  path: string | null;
}

let decks: Deck[] = [];
let activeIndex = 0;

// Web Audio graph: (deckA, deckB) → preamp → EQ biquads → analyser →
// replayGain → masterGain → destination. Built lazily on first playback.
let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let preampNode: GainNode | null = null;
let eqNodes: BiquadFilterNode[] = [];
let masterGain: GainNode | null = null;
let replayGainNode: GainNode | null = null;
let lastReplayGain = 1;
let lastVolume = 1;

interface EqSettings {
  eq_enabled: boolean;
  eq_bands: { frequency: number; gain: number; q: number }[];
  preamp_db: number;
}
let pendingEq: EqSettings | null = null;

function ensureDecks(): void {
  if (decks.length) return;
  for (let i = 0; i < 2; i++) {
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.preload = "auto";
    decks.push({ el, source: null, gain: null, path: null });
  }
}

function activeDeck(): Deck {
  ensureDecks();
  return decks[activeIndex];
}

function inactiveDeck(): Deck {
  ensureDecks();
  return decks[1 - activeIndex];
}

// The active element — kept as a helper so the transport methods read/write a
// single deck without caring which one is active.
function audio(): HTMLAudioElement {
  return activeDeck().el;
}

function ensureGraph(): void {
  if (analyser || typeof AudioContext === "undefined") return;
  try {
    ensureDecks();
    ctx = new AudioContext();
    preampNode = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    // Both decks feed the preamp through their own gain (source → gain →
    // preamp). The active deck is at unity; the idle one is silent.
    decks.forEach((deck, i) => {
      if (!deck.source) deck.source = ctx!.createMediaElementSource(deck.el);
      if (!deck.gain) deck.gain = ctx!.createGain();
      deck.gain.gain.value = i === activeIndex ? 1 : 0;
      deck.source.connect(deck.gain);
      deck.gain.connect(preampNode!);
    });

    // preamp → b0 … b4 → analyser
    let node: AudioNode = preampNode;
    eqNodes = [];
    for (let i = 0; i < EQ_FREQUENCIES.length; i++) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = "peaking";
      biquad.frequency.value = EQ_FREQUENCIES[i];
      biquad.Q.value = 1;
      biquad.gain.value = 0;
      node.connect(biquad);
      node = biquad;
      eqNodes.push(biquad);
    }
    node.connect(analyser);

    // analyser → replayGain → masterGain → destination
    replayGainNode = ctx.createGain();
    replayGainNode.gain.value = lastReplayGain;
    masterGain = ctx.createGain();
    masterGain.gain.value = lastVolume;
    analyser.connect(replayGainNode);
    replayGainNode.connect(masterGain);
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
  // Point the active deck at a local file path, resolved through Tauri's asset
  // protocol so the webview is allowed to read it. No-op if already loaded.
  load(path: string): void {
    const deck = activeDeck();
    if (deck.path === path) return;
    deck.el.src = convertFileSrc(path);
    deck.path = path;
  },
  // Buffer a track into the inactive deck so a later swap is gapless. No-op if
  // that deck already holds this path.
  preload(path: string): void {
    const deck = inactiveDeck();
    if (deck.path === path) return;
    deck.el.src = convertFileSrc(path);
    deck.path = path;
    deck.el.load();
  },
  // The path currently buffered in the inactive (preload) deck, if any.
  preloadedPath(): string | null {
    return decks.length ? inactiveDeck().path : null;
  },
  // Swap the inactive (preloaded) deck to active. Pauses the old deck and
  // rewinds it. Returns false when nothing is preloaded. The caller resumes the
  // now-active deck. Used for gapless advance.
  swapToPreloaded(): boolean {
    if (!decks.length) return false;
    const next = inactiveDeck();
    if (!next.path) return false;
    const current = activeDeck();
    current.el.pause();
    current.el.currentTime = 0;
    // Hand the gain over so the newly-active deck is audible and the old one
    // silent (relevant once per-deck gains exist for crossfade).
    if (current.gain) current.gain.gain.value = 0;
    if (next.gain) next.gain.gain.value = 1;
    activeIndex = 1 - activeIndex;
    return true;
  },
  // Crossfade into the preloaded next track over `durationSecs`: start the idle
  // deck and ramp its gain 0→1 while the current deck ramps 1→0, then pause the
  // old deck. Returns false (caller should fall back to a normal advance) when
  // there's no preloaded track or no audio graph yet.
  startCrossfade(durationSecs: number): boolean {
    if (!ctx || decks.length < 2 || durationSecs <= 0) return false;
    const current = activeDeck();
    const next = inactiveDeck();
    if (!next.path || !next.gain || !current.gain) return false;

    const t = ctx.currentTime;
    next.el.currentTime = 0;
    void next.el.play().catch(() => {});

    current.gain.gain.cancelScheduledValues(t);
    current.gain.gain.setValueAtTime(current.gain.gain.value, t);
    current.gain.gain.linearRampToValueAtTime(0, t + durationSecs);

    next.gain.gain.cancelScheduledValues(t);
    next.gain.gain.setValueAtTime(0, t);
    next.gain.gain.linearRampToValueAtTime(1, t + durationSecs);

    const oldEl = current.el;
    activeIndex = 1 - activeIndex; // controls now reflect the incoming track
    setTimeout(
      () => {
        try {
          oldEl.pause();
          oldEl.currentTime = 0;
        } catch {
          /* ignore */
        }
      },
      durationSecs * 1000 + 120,
    );
    return true;
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
  // engines can attach to an AudioContext + node.
  ensureGraph(): void {
    ensureGraph();
  },
  getAudioContext(): AudioContext | null {
    return ctx;
  },
  // A node carrying the program audio, for external visualizers to tap.
  getVizSource(): AudioNode | null {
    return preampNode;
  },
  getAnalyser(): AnalyserNode | null {
    return analyser;
  },
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
  // True when the active deck has played to the end (drives queue advance).
  hasEnded(): boolean {
    return audio().ended;
  },
  seek(secs: number): void {
    audio().currentTime = secs;
  },
  // Apply the current track's ReplayGain (dB; null = none → unity). Held so it
  // survives a graph (re)build between tracks.
  setReplayGain(db: number | null): void {
    lastReplayGain = replayGainMultiplier(db);
    if (replayGainNode) replayGainNode.gain.value = lastReplayGain;
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
