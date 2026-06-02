// Thin adapter over a single HTMLAudioElement. The store calls this for the
// 'web' source; tests mock this module so decision logic stays deterministic.
let el: HTMLAudioElement | null = null;

function audio(): HTMLAudioElement {
  if (!el) el = new Audio();
  return el;
}

export const webDriver = {
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
