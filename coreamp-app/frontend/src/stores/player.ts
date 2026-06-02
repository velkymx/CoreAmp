import { defineStore } from "pinia";
import type { Source, Track } from "@/types";
import * as api from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";

export type ToggleResult = "paused" | "resumed" | "played" | "busy" | "noop";
export type NavResult = "played" | "ended" | "busy" | "noop";

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  source: Source;
  nativeAvailable: boolean;
  inFlight: boolean;
}

export const usePlayerStore = defineStore("player", {
  state: (): PlayerState => ({
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    source: "web",
    nativeAvailable: false,
    inFlight: false,
  }),
  actions: {
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

    async nextTrack(): Promise<NavResult> {
      if (this.inFlight) return "busy"; // H-B: no concurrent transitions
      if (!this.queue.length || this.currentIndex < 0) return "noop";
      this.inFlight = true;
      try {
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
