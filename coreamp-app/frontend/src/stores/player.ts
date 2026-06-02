import { defineStore } from "pinia";
import type { Source, Track } from "@/types";
import * as api from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";

export type ToggleResult = "paused" | "resumed" | "played" | "busy" | "noop";

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
