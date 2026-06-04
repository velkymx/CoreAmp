import { defineStore } from "pinia";
import type {
  NativeOutputDevice,
  NativeStatus,
  Source,
  Track,
  TrackArtwork,
  TrackSignalDetails,
} from "@/types";
import * as api from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";
import { buildShuffleOrder } from "@/util/shuffle";
import { restoreQueue, persistQueueIfChanged } from "@/util/queueStorage";
import { shouldStartCrossfade } from "@/util/crossfade";
import { useNotifyStore, errorMessage } from "@/stores/notify";

export type ToggleResult = "paused" | "resumed" | "played" | "busy" | "noop";
export type NavResult = "played" | "ended" | "busy" | "noop";
export type RepeatMode = "off" | "queue" | "track";
export type ReplayGainMode = "off" | "track" | "album";

const RG_MODE_KEY = "coreamp.replaygain.mode";
function loadReplayGainMode(): ReplayGainMode {
  try {
    const v = localStorage.getItem(RG_MODE_KEY);
    if (v === "off" || v === "track" || v === "album") return v;
  } catch {
    /* storage unavailable */
  }
  return "track";
}
function persistReplayGainMode(mode: ReplayGainMode): void {
  try {
    localStorage.setItem(RG_MODE_KEY, mode);
  } catch {
    /* best-effort */
  }
}

const GAPLESS_KEY = "coreamp.gapless";
function loadGapless(): boolean {
  try {
    return localStorage.getItem(GAPLESS_KEY) === "1";
  } catch {
    return false;
  }
}
function persistGapless(on: boolean): void {
  try {
    localStorage.setItem(GAPLESS_KEY, on ? "1" : "0");
  } catch {
    /* best-effort */
  }
}

const CROSSFADE_KEY = "coreamp.crossfade.secs";
function loadCrossfade(): number {
  try {
    const v = Number.parseFloat(localStorage.getItem(CROSSFADE_KEY) ?? "");
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch {
    return 0;
  }
}
function persistCrossfade(secs: number): void {
  try {
    localStorage.setItem(CROSSFADE_KEY, String(secs));
  } catch {
    /* best-effort */
  }
}

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  source: Source;
  nativeAvailable: boolean;
  inFlight: boolean;
  positionSecs: number;
  durationSecs: number | null;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  shuffleOrder: number[];
  shufflePos: number;
  repeatMode: RepeatMode;
  stopAfterCurrent: boolean;
  // Which ReplayGain to apply on playback (off / per-track / per-album).
  replayGainMode: ReplayGainMode;
  // Preload the next track into a second deck and swap on end-of-track.
  gapless: boolean;
  // Crossfade duration (seconds, 0 = off) + an in-flight guard.
  crossfadeSecs: number;
  crossfading: boolean;
  // Wall-clock ms when the sleep timer fires (null = no timer armed).
  sleepEndsAt: number | null;
  artwork: TrackArtwork | null;
  signal: TrackSignalDetails | null;
  metaToken: number;
  outputDevices: NativeOutputDevice[];
  selectedOutputDevice: string | null;
}

// Thumbnail edge (px) requested from the backend for now-playing artwork.
const ARTWORK_THUMB_PX = 256;

// The sleep-timer handle lives outside reactive state: it's an opaque token we
// only ever clear, never render.
let sleepHandle: ReturnType<typeof setTimeout> | null = null;

export const usePlayerStore = defineStore("player", {
  state: (): PlayerState => ({
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    source: "web",
    nativeAvailable: false,
    inFlight: false,
    positionSecs: 0,
    durationSecs: null,
    volume: 0.8,
    muted: false,
    shuffle: false,
    shuffleOrder: [],
    shufflePos: 0,
    repeatMode: "off",
    stopAfterCurrent: false,
    replayGainMode: "track",
    gapless: false,
    crossfadeSecs: 0,
    crossfading: false,
    sleepEndsAt: null,
    artwork: null,
    signal: null,
    metaToken: 0,
    outputDevices: [],
    selectedOutputDevice: null,
  }),
  getters: {
    currentTrack(state): Track | null {
      return state.queue[state.currentIndex] ?? null;
    },
    sleepActive(state): boolean {
      return state.sleepEndsAt != null;
    },
  },
  actions: {
    // CoreAmp plays through the in-webview Web Audio path (single output).
    // Native is disabled so every transport routes to the web driver, which is
    // also what feeds the EQ + visualizer.
    init(): void {
      this.source = "web";
      this.nativeAvailable = false;
      this.replayGainMode = loadReplayGainMode();
      this.gapless = loadGapless();
      this.crossfadeSecs = loadCrossfade();

      // Restore the queue from the previous session (paused — we remember what
      // was queued and where, but don't auto-start audio on launch).
      const restored = restoreQueue();
      if (restored && restored.queue.length > 0) {
        this.queue = restored.queue;
        this.currentIndex = restored.currentIndex;
      }

      // Persist on every structural queue/index change. The signature guard in
      // persistQueueIfChanged ignores the frequent position-only status ticks.
      this.$subscribe(() => persistQueueIfChanged(this.queue, this.currentIndex), {
        flush: "sync",
      });
    },

    // Switch the output path (native rodio vs in-webview Web Audio). Restarts the
    // current track on the new path if something was playing. Refuses to select
    // native when the engine isn't available.
    async setSource(next: Source): Promise<void> {
      if (next === this.source) return;
      if (next === "native" && !this.nativeAvailable) {
        useNotifyStore().error("Native audio engine is unavailable.");
        return;
      }
      const wasPlaying = this.isPlaying;
      await this.stopPlayback();
      this.source = next;
      if (wasPlaying && this.currentIndex >= 0) await this.playCurrent();
    },

    // Toggle the like flag on the current track via the backend, updating the
    // in-memory track so the heart reflects immediately (the Liked view reads
    // the same flag from the DB).
    async toggleLike(): Promise<void> {
      const track = this.queue[this.currentIndex];
      if (!track) return;
      track.liked = await api.toggleLiked(track.path);
    },

    // Apply an effective output level (0..1) to the active playback source.
    async applyVolume(level: number): Promise<void> {
      if (this.source === "native" && this.nativeAvailable) {
        await api.nativeAudioSetVolume(level);
      } else {
        webDriver.setVolume(level);
      }
    },

    // Set the output volume (0..1). A deliberate volume change unmutes.
    async setVolume(level: number): Promise<void> {
      const clamped = Math.min(Math.max(level, 0), 1);
      this.volume = clamped;
      this.muted = false;
      await this.applyVolume(clamped);
    },

    // Toggle mute, applying 0 while muted and restoring the stored volume.
    async toggleMute(): Promise<void> {
      this.muted = !this.muted;
      await this.applyVolume(this.muted ? 0 : this.volume);
    },

    // Load the available native output devices and which one is currently
    // selected (null = system default).
    async loadOutputDevices(): Promise<void> {
      const [devices, selection] = await Promise.all([
        api.listNativeOutputDevices(),
        api.nativeAudioSelectedOutputDevice(),
      ]);
      this.outputDevices = devices;
      this.selectedOutputDevice = selection.selected_name;
    },

    // Switch the native output device (null routes to the system default). The
    // local selection only advances once the backend accepts the change, so a
    // rejected switch leaves the picker on the device that is actually active.
    async setOutputDevice(name: string | null): Promise<void> {
      await api.nativeAudioSetOutputDevice(name);
      this.selectedOutputDevice = name;
    },

    // Scrub to a position (seconds), clamped to [0, duration]. Routes to the
    // native engine or the web element depending on the active source.
    async seek(targetSecs: number): Promise<void> {
      const clamped =
        this.durationSecs != null
          ? Math.min(Math.max(targetSecs, 0), this.durationSecs)
          : Math.max(targetSecs, 0);
      if (this.source === "native" && this.nativeAvailable) {
        await api.nativeAudioSeek(clamped);
      } else {
        webDriver.seek(clamped);
      }
      this.positionSecs = clamped;
    },

    // Pull live playback position/duration from a native status poll.
    syncFromNativeStatus(status: NativeStatus): void {
      if (status.position_secs != null) this.positionSecs = status.position_secs;
      this.durationSecs = status.duration_secs;
    },

    // Poll the active output for live position/duration to drive the progress
    // bar. Web reads the <audio> element; native (disabled) reads its status.
    async refreshStatus(): Promise<void> {
      if (this.source === "web") {
        this.positionSecs = webDriver.position();
        const dur = webDriver.duration();
        this.durationSecs = dur > 0 ? dur : null;
        // Begin a crossfade into the next track if we're inside the fade window.
        this.maybeStartCrossfade();
        // The web element signals end-of-track; advance the queue (unless a
        // crossfade already moved us on).
        if (webDriver.hasEnded() && this.isPlaying && !this.crossfading) {
          void this.nextTrack();
        }
        return;
      }
      if (this.source !== "native" || !this.nativeAvailable) return;
      const status = await api.nativeAudioStatus();
      this.syncFromNativeStatus(status);
    },

    // Fetch now-playing artwork + signal details for the current track. Each
    // call takes a token so a slow response for a track the user already skipped
    // past is discarded instead of clobbering the newer one. Backend errors leave
    // the metadata cleared rather than surfacing a transient read failure.
    async loadNowPlayingMeta(): Promise<void> {
      const token = ++this.metaToken;
      const track = this.queue[this.currentIndex];
      if (!track) {
        this.artwork = null;
        this.signal = null;
        return;
      }
      const path = track.path;
      const [artwork, signal] = await Promise.all([
        api.readTrackArtwork(path, ARTWORK_THUMB_PX).catch(() => null),
        api.readTrackSignalDetails(path).catch(() => null),
      ]);
      if (token !== this.metaToken) return; // a newer load supersedes this one
      this.artwork = artwork;
      this.signal = signal;
    },

    // Rebuild a current-first shuffle order after a structural queue edit, so
    // shuffle stays coherent when the queue length or current index changes.
    resyncShuffle(): void {
      if (!this.shuffle) return;
      this.shuffleOrder = buildShuffleOrder(this.queue.length, this.currentIndex);
      this.shufflePos = 0;
    },

    // Append a track to the end of the queue.
    enqueue(track: Track): void {
      this.queue.push(track);
      if (this.currentIndex < 0) this.currentIndex = 0;
      this.resyncShuffle();
    },

    // Insert a track to play immediately after the current one.
    playNext(track: Track): void {
      if (this.currentIndex < 0) {
        this.enqueue(track);
        return;
      }
      this.queue.splice(this.currentIndex + 1, 0, track);
      this.resyncShuffle();
    },

    // Remove a queue entry, keeping currentIndex pointed at the same track when
    // possible (shifts down if an earlier entry was removed).
    removeAt(index: number): void {
      if (index < 0 || index >= this.queue.length) return;
      this.queue.splice(index, 1);
      if (index < this.currentIndex) {
        this.currentIndex -= 1;
      } else if (index === this.currentIndex) {
        this.currentIndex = Math.min(this.currentIndex, this.queue.length - 1);
      }
      this.resyncShuffle();
    },

    // Move a queue entry from one position to another (drag reorder), keeping
    // the currently playing track selected.
    moveInQueue(from: number, to: number): void {
      const len = this.queue.length;
      if (from < 0 || from >= len || to < 0 || to >= len || from === to) return;
      const current = this.queue[this.currentIndex];
      const [moved] = this.queue.splice(from, 1);
      this.queue.splice(to, 0, moved);
      if (current) this.currentIndex = this.queue.indexOf(current);
      this.resyncShuffle();
    },

    // Empty the whole queue and stop playback.
    async clearQueue(): Promise<void> {
      await this.stopPlayback();
      this.queue = [];
      this.currentIndex = -1;
      this.shuffleOrder = [];
      this.shufflePos = 0;
    },

    // Drop everything before the current track ("clear played").
    clearPlayed(): void {
      if (this.currentIndex <= 0) return;
      this.queue.splice(0, this.currentIndex);
      this.currentIndex = 0;
      this.resyncShuffle();
    },

    // Jump to a queue index and play it ("play from here").
    async jumpTo(index: number): Promise<void> {
      if (index < 0 || index >= this.queue.length) return;
      this.currentIndex = index;
      if (this.shuffle) {
        this.shuffleOrder = buildShuffleOrder(this.queue.length, index);
        this.shufflePos = 0;
      }
      await this.playCurrent();
    },

    // Toggle "stop after current": the next end-of-track transition stops
    // instead of advancing.
    toggleStopAfterCurrent(): void {
      this.stopAfterCurrent = !this.stopAfterCurrent;
    },

    // Arm a sleep timer that pauses playback after `minutes`. A non-positive
    // value (or calling cancelSleepTimer) disarms it. Re-arming replaces any
    // existing timer.
    setSleepTimer(minutes: number): void {
      this.cancelSleepTimer();
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      const ms = minutes * 60_000;
      this.sleepEndsAt = Date.now() + ms;
      sleepHandle = setTimeout(() => {
        sleepHandle = null;
        this.sleepEndsAt = null;
        void this.stopPlayback();
      }, ms);
    },

    cancelSleepTimer(): void {
      if (sleepHandle != null) {
        clearTimeout(sleepHandle);
        sleepHandle = null;
      }
      this.sleepEndsAt = null;
    },

    // Replace the queue with the given tracks and start playing at startIndex.
    // Rebuilds the shuffle order (current-first) when shuffle is on so the new
    // queue shuffles coherently.
    async playTracks(tracks: Track[], startIndex = 0): Promise<void> {
      if (tracks.length === 0) return;
      const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
      this.queue = tracks.slice();
      this.currentIndex = index;
      if (this.shuffle) {
        this.shuffleOrder = buildShuffleOrder(this.queue.length, index);
        this.shufflePos = 0;
      }
      await this.playCurrent();
    },

    // Read the given track's ReplayGain and apply the value selected by the
    // current mode (album falls back to track gain). Guarded so a slow read for
    // a track the user already skipped past is dropped. "off" → unity.
    applyReplayGainFor(path: string): void {
      if (this.replayGainMode === "off") {
        webDriver.setReplayGain(null);
        return;
      }
      const mode = this.replayGainMode;
      void api
        .readReplayGain(path)
        .then((info) => {
          if (this.queue[this.currentIndex]?.path !== path) return;
          const db = mode === "album" ? (info.album ?? info.track) : info.track;
          webDriver.setReplayGain(db ?? null);
        })
        .catch(() => {});
    },

    // Change the ReplayGain mode (persisted) and re-apply to the current track.
    setReplayGainMode(mode: ReplayGainMode): void {
      this.replayGainMode = mode;
      persistReplayGainMode(mode);
      const current = this.queue[this.currentIndex];
      if (current && !(this.source === "native" && this.nativeAvailable)) {
        if (mode === "off") webDriver.setReplayGain(null);
        else this.applyReplayGainFor(current.path);
      }
    },

    // When gapless is on, buffer the upcoming track into the second deck so the
    // end-of-track advance can swap to it without a load gap. Only the linear
    // next track is preloaded (shuffle order is decided at advance time).
    preloadNext(): void {
      if (!this.gapless && this.crossfadeSecs <= 0) return;
      if (this.source === "native" && this.nativeAvailable) return;
      const next = this.queue[this.currentIndex + 1];
      if (next) webDriver.preload?.(next.path);
    },

    // Toggle gapless (persisted). Turning it on preloads the next track now.
    setGapless(on: boolean): void {
      this.gapless = on;
      persistGapless(on);
      if (on) this.preloadNext();
    },

    // Set the crossfade duration in seconds (0 = off; persisted). Preloads the
    // next track so the fade has something buffered to fade into.
    setCrossfade(secs: number): void {
      this.crossfadeSecs = Math.max(0, secs);
      persistCrossfade(this.crossfadeSecs);
      if (this.crossfadeSecs > 0) this.preloadNext();
    },

    // Near end-of-track, if crossfade is enabled and the next track is already
    // buffered, ramp into it. Returns true when a crossfade was started.
    maybeStartCrossfade(): boolean {
      if (this.crossfading || this.crossfadeSecs <= 0 || !this.isPlaying) return false;
      if (this.source === "native" && this.nativeAvailable) return false;
      const next = this.queue[this.currentIndex + 1];
      if (!next) return false;
      if (!shouldStartCrossfade(this.positionSecs, this.durationSecs, this.crossfadeSecs, true)) {
        return false;
      }
      if (webDriver.preloadedPath?.() !== next.path) return false;
      if (!webDriver.startCrossfade?.(this.crossfadeSecs)) return false;

      this.crossfading = true;
      this.currentIndex += 1;
      webDriver.setReplayGain(null);
      this.applyReplayGainFor(next.path);
      void this.loadNowPlayingMeta();
      void api.recordPlay(next.path).catch(() => {});
      this.preloadNext();
      setTimeout(() => {
        this.crossfading = false;
      }, this.crossfadeSecs * 1000 + 200);
      return true;
    },

    async playCurrent(): Promise<void> {
      const track = this.queue[this.currentIndex];
      if (!track) return;
      try {
        if (this.source === "native" && this.nativeAvailable) {
          await api.nativeAudioPlay(track.path);
        } else {
          // Gapless: if the next deck already buffered this track, swap to it
          // instead of reloading; otherwise load normally.
          const swapped =
            webDriver.preloadedPath?.() === track.path && webDriver.swapToPreloaded();
          if (!swapped) webDriver.load(track.path);
          webDriver.setVolume(this.muted ? 0 : this.volume);
          // Reset ReplayGain for the new track, then apply per the current mode.
          webDriver.setReplayGain(null);
          this.applyReplayGainFor(track.path);
          await webDriver.resume();
          this.preloadNext();
        }
        this.isPlaying = true;
        void this.loadNowPlayingMeta();
        void api.recordPlay(track.path).catch(() => {});
      } catch (err) {
        // Playback failed (file gone, decode error, no output device …).
        // Surface it instead of failing silently.
        this.isPlaying = false;
        const label = track.title ?? track.path;
        useNotifyStore().error(`Couldn't play ${label}: ${errorMessage(err)}`);
      }
    },

    async stopPlayback(): Promise<void> {
      if (this.source === "native" && this.nativeAvailable) {
        await api.nativeAudioStop();
      } else {
        webDriver.pause();
      }
      this.isPlaying = false;
    },

    // Rotate the repeat mode: off -> queue -> track -> off.
    cycleRepeat(): void {
      this.repeatMode =
        this.repeatMode === "off"
          ? "queue"
          : this.repeatMode === "queue"
            ? "track"
            : "off";
    },

    // Build a fresh current-first shuffle order; toggling never interrupts the
    // current track (no playback call here).
    toggleShuffle(): void {
      this.shuffle = !this.shuffle;
      if (this.shuffle) {
        this.shuffleOrder = buildShuffleOrder(this.queue.length, this.currentIndex);
        this.shufflePos = 0;
      } else {
        this.shuffleOrder = [];
        this.shufflePos = 0;
      }
    },

    async nextTrack(): Promise<NavResult> {
      if (this.inFlight) return "busy"; // H-B: no concurrent transitions
      if (!this.queue.length || this.currentIndex < 0) return "noop";
      this.inFlight = true;
      try {
        // "Stop after current" overrides every advance rule, once.
        if (this.stopAfterCurrent) {
          this.stopAfterCurrent = false;
          await this.stopPlayback();
          return "ended";
        }
        if (this.repeatMode === "track") {
          await this.playCurrent();
          return "played";
        }
        if (this.shuffle && this.shuffleOrder.length > 0) {
          if (this.shufflePos + 1 < this.shuffleOrder.length) {
            this.shufflePos += 1;
            this.currentIndex = this.shuffleOrder[this.shufflePos];
            await this.playCurrent();
            return "played";
          }
          if (this.repeatMode === "queue") {
            this.shufflePos = 0;
            this.currentIndex = this.shuffleOrder[0];
            await this.playCurrent();
            return "played";
          }
          await this.stopPlayback();
          return "ended";
        }
        if (this.currentIndex + 1 < this.queue.length) {
          this.currentIndex += 1;
          await this.playCurrent();
          return "played";
        }
        if (this.repeatMode === "queue") {
          this.currentIndex = 0;
          await this.playCurrent();
          return "played";
        }
        // End of the queue: stop, leaving the index on the last track.
        await this.stopPlayback();
        return "ended";
      } finally {
        this.inFlight = false;
      }
    },

    async prevTrack(): Promise<NavResult> {
      if (this.inFlight) return "busy"; // H-B: no concurrent transitions
      if (!this.queue.length || this.currentIndex < 0) return "noop";
      this.inFlight = true;
      try {
        if (this.shuffle && this.shuffleOrder.length > 0) {
          if (this.shufflePos > 0) {
            this.shufflePos -= 1;
          } else if (this.repeatMode === "queue") {
            this.shufflePos = this.shuffleOrder.length - 1;
          }
          this.currentIndex = this.shuffleOrder[this.shufflePos];
          await this.playCurrent();
          return "played";
        }
        // Step back; wrap to the end when repeating the queue, otherwise restart
        // the current track at the start.
        if (this.currentIndex > 0) {
          this.currentIndex -= 1;
        } else if (this.repeatMode === "queue") {
          this.currentIndex = this.queue.length - 1;
        }
        await this.playCurrent();
        return "played";
      } finally {
        this.inFlight = false;
      }
    },

    async togglePlayback(): Promise<ToggleResult> {
      if (this.inFlight) return "busy"; // H-B: no concurrent transitions
      this.inFlight = true;
      try {
        if (this.source === "native" && this.nativeAvailable) {
          if (this.isPlaying) {
            await api.nativeAudioPause();
            this.isPlaying = false;
            return "paused";
          }
          await api.nativeAudioResume();
          this.isPlaying = true;
          return "resumed";
        }

        // Web source (or native unavailable). Decide on authoritative state,
        // never on a transient status read (H-A).
        if (webDriver.isLoaded()) {
          if (this.isPlaying) {
            webDriver.pause();
            this.isPlaying = false;
            return "paused";
          }
          await webDriver.resume();
          this.isPlaying = true;
          return "resumed";
        }

        // Nothing loaded: if a track is queued, play it. Never silently no-op
        // when there is something to play (the H-A failure mode).
        if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
          await this.playCurrent();
          return "played";
        }
        return "noop";
      } finally {
        this.inFlight = false; // released even on error: buttons never wedge
      }
    },
  },
});
