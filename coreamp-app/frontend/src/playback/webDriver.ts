// Thin adapter over a single HTMLAudioElement. The store calls this for the
// 'web' source; tests mock this module so decision logic stays deterministic.
import { convertFileSrc } from "@tauri-apps/api/core";

let el: HTMLAudioElement | null = null;
let loadedPath: string | null = null;

function audio(): HTMLAudioElement {
  if (!el) el = new Audio();
  return el;
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
    await audio().play();
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
