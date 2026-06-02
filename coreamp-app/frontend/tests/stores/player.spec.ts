import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/tauri", () => ({
  nativeAudioPause: vi.fn().mockResolvedValue(undefined),
  nativeAudioResume: vi.fn().mockResolvedValue(undefined),
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  nativeAudioStop: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    isLoaded: vi.fn(() => false),
    isPaused: vi.fn(() => true),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
  },
}));

import { nativeAudioPause, nativeAudioResume } from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";
import { usePlayerStore } from "@/stores/player";

const track = { path: "/m/a.mp3", title: "A", artist: "X", album: "Y" };

describe("player.togglePlayback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("native + playing -> pauses native", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: true });
    await p.togglePlayback();
    expect(nativeAudioPause).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(false);
  });

  it("native + paused -> resumes native", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: false });
    await p.togglePlayback();
    expect(nativeAudioResume).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(true);
  });

  it("web + loaded + playing -> pauses web", async () => {
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const p = usePlayerStore();
    p.$patch({ source: "web", isPlaying: true });
    await p.togglePlayback();
    expect(webDriver.pause).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(false);
  });

  it("web + loaded + paused -> resumes web", async () => {
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const p = usePlayerStore();
    p.$patch({ source: "web", isPlaying: false });
    await p.togglePlayback();
    expect(webDriver.resume).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(true);
  });

  it("DESYNC: native selected but nothing loaded + queued -> plays current, never silent", async () => {
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: false,
      isPlaying: false,
      queue: [track],
      currentIndex: 0,
    });
    const result = await p.togglePlayback();
    expect(result).not.toBe("noop");
    expect(p.isPlaying).toBe(true);
  });

  it("re-entrancy: second call while in flight returns 'busy' and does not double-invoke", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: true });
    const first = p.togglePlayback();
    const second = await p.togglePlayback();
    await first;
    expect(second).toBe("busy");
    expect(nativeAudioPause).toHaveBeenCalledOnce();
  });
});
