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
};

export type WebDriver = typeof webDriver;
