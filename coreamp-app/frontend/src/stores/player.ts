import { defineStore } from "pinia";
import type { NativeStatus, Source, Track } from "@/types";
import * as api from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";
import { buildShuffleOrder } from "@/util/shuffle";

export type ToggleResult = "paused" | "resumed" | "played" | "busy" | "noop";
export type NavResult = "played" | "ended" | "busy" | "noop";

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
}

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
  }),
  actions: {
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

    // Poll the native engine for live position/duration. No-op unless the native
    // source is active, so the UI interval is cheap when playing via the web path.
    async refreshNativeStatus(): Promise<void> {
      if (this.source !== "native" || !this.nativeAvailable) return;
      const status = await api.nativeAudioStatus();
      this.syncFromNativeStatus(status);
    },

    async playCurrent(): Promise<void> {
      const track = this.queue[this.currentIndex];
      if (!track) return;
      if (this.source === "native" && this.nativeAvailable) {
        await api.nativeAudioPlay(track.path);
      } else {
        await webDriver.resume();
      }
      this.isPlaying = true;
    },

    async stopPlayback(): Promise<void> {
      if (this.source === "native" && this.nativeAvailable) {
        await api.nativeAudioStop();
      } else {
        webDriver.pause();
      }
      this.isPlaying = false;
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
        if (this.shuffle && this.shuffleOrder.length > 0) {
          if (this.shufflePos + 1 < this.shuffleOrder.length) {
            this.shufflePos += 1;
            this.currentIndex = this.shuffleOrder[this.shufflePos];
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
            this.currentIndex = this.shuffleOrder[this.shufflePos];
          }
          await this.playCurrent();
          return "played";
        }
        // Step back, or restart the current track when already at the start.
        if (this.currentIndex > 0) {
          this.currentIndex -= 1;
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
