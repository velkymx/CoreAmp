import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/tauri", () => ({
  nativeAudioPause: vi.fn().mockResolvedValue(undefined),
  nativeAudioResume: vi.fn().mockResolvedValue(undefined),
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  nativeAudioStop: vi.fn().mockResolvedValue(undefined),
  nativeAudioSeek: vi.fn().mockResolvedValue(undefined),
  nativeAudioStatus: vi.fn().mockResolvedValue(undefined),
  nativeAudioSetVolume: vi.fn().mockResolvedValue(undefined),
  toggleLiked: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    isLoaded: vi.fn(() => false),
    isPaused: vi.fn(() => true),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    setVolume: vi.fn(),
  },
}));

import {
  nativeAudioPause,
  nativeAudioResume,
  nativeAudioPlay,
  nativeAudioStop,
  nativeAudioSeek,
  nativeAudioStatus,
  nativeAudioSetVolume,
  toggleLiked,
} from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";
import { usePlayerStore } from "@/stores/player";

const track = { path: "/m/a.mp3", title: "A", artist: "X", album: "Y", liked: false };
const mkQueue = () => [
  { path: "/m/0.mp3", title: "0", artist: "X", album: "Y", liked: false },
  { path: "/m/1.mp3", title: "1", artist: "X", album: "Y", liked: false },
  { path: "/m/2.mp3", title: "2", artist: "X", album: "Y", liked: false },
];

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

describe("player.nextTrack / prevTrack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("nextTrack advances the index and plays the next queued track", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      isPlaying: true,
    });
    const result = await p.nextTrack();
    expect(result).toBe("played");
    expect(p.currentIndex).toBe(1);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/1.mp3");
    expect(p.isPlaying).toBe(true);
  });

  it("nextTrack at the end of the queue stops playback and does not advance", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 2,
      isPlaying: true,
    });
    const result = await p.nextTrack();
    expect(result).toBe("ended");
    expect(p.currentIndex).toBe(2);
    expect(nativeAudioStop).toHaveBeenCalledOnce();
    expect(nativeAudioPlay).not.toHaveBeenCalled();
    expect(p.isPlaying).toBe(false);
  });

  it("prevTrack steps back to the previous track", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 2,
      isPlaying: true,
    });
    const result = await p.prevTrack();
    expect(result).toBe("played");
    expect(p.currentIndex).toBe(1);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/1.mp3");
  });

  it("prevTrack at the start restarts the current track", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      isPlaying: true,
    });
    const result = await p.prevTrack();
    expect(result).toBe("played");
    expect(p.currentIndex).toBe(0);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/0.mp3");
  });

  it("nextTrack on an empty queue is a no-op", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, queue: [], currentIndex: -1 });
    expect(await p.nextTrack()).toBe("noop");
  });

  it("re-entrancy: nextTrack while in flight returns 'busy'", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      isPlaying: true,
    });
    const first = p.nextTrack();
    const second = await p.nextTrack();
    await first;
    expect(second).toBe("busy");
    expect(nativeAudioPlay).toHaveBeenCalledOnce();
  });
});

describe("player.seek / syncFromNativeStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("seek on native source calls nativeAudioSeek and updates position", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, durationSecs: 120 });
    await p.seek(30);
    expect(nativeAudioSeek).toHaveBeenCalledWith(30);
    expect(p.positionSecs).toBe(30);
  });

  it("seek clamps to [0, duration]", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, durationSecs: 120 });
    await p.seek(999);
    expect(nativeAudioSeek).toHaveBeenCalledWith(120);
    expect(p.positionSecs).toBe(120);
    await p.seek(-5);
    expect(nativeAudioSeek).toHaveBeenLastCalledWith(0);
    expect(p.positionSecs).toBe(0);
  });

  it("seek on web source calls webDriver.seek", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "web", durationSecs: 100 });
    await p.seek(40);
    expect(webDriver.seek).toHaveBeenCalledWith(40);
    expect(p.positionSecs).toBe(40);
  });

  it("refreshNativeStatus polls the engine and syncs when native is active", async () => {
    (nativeAudioStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: true,
      active: true,
      paused: false,
      finished: false,
      current_path: "/m/a.mp3",
      detail: null,
      position_secs: 12,
      duration_secs: 200,
    });
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true });
    await p.refreshNativeStatus();
    expect(nativeAudioStatus).toHaveBeenCalledOnce();
    expect(p.positionSecs).toBe(12);
    expect(p.durationSecs).toBe(200);
  });

  it("refreshNativeStatus is a no-op when source is not native", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "web", nativeAvailable: false });
    await p.refreshNativeStatus();
    expect(nativeAudioStatus).not.toHaveBeenCalled();
  });

  it("syncFromNativeStatus updates position and duration", () => {
    const p = usePlayerStore();
    p.syncFromNativeStatus({
      available: true,
      active: true,
      paused: false,
      finished: false,
      current_path: "/m/a.mp3",
      detail: null,
      position_secs: 42,
      duration_secs: 120,
    });
    expect(p.positionSecs).toBe(42);
    expect(p.durationSecs).toBe(120);
  });
});

describe("player.toggleShuffle", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enabling shuffle builds a current-first order without interrupting playback", () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 1,
      isPlaying: true,
    });
    p.toggleShuffle();
    expect(p.shuffle).toBe(true);
    expect(p.shuffleOrder).toHaveLength(3);
    expect(p.shuffleOrder[0]).toBe(1);
    expect(p.shufflePos).toBe(0);
    // Current track keeps playing: no play/stop call, index unchanged.
    expect(nativeAudioPlay).not.toHaveBeenCalled();
    expect(nativeAudioStop).not.toHaveBeenCalled();
    expect(p.currentIndex).toBe(1);
    expect(p.isPlaying).toBe(true);
  });

  it("disabling shuffle clears the order", () => {
    const p = usePlayerStore();
    p.$patch({ shuffle: true, shuffleOrder: [1, 0, 2], shufflePos: 0 });
    p.toggleShuffle();
    expect(p.shuffle).toBe(false);
    expect(p.shuffleOrder).toEqual([]);
  });

  it("nextTrack follows the shuffle order", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 1,
      shuffle: true,
      shuffleOrder: [1, 2, 0],
      shufflePos: 0,
      isPlaying: true,
    });
    const result = await p.nextTrack();
    expect(result).toBe("played");
    expect(p.shufflePos).toBe(1);
    expect(p.currentIndex).toBe(2);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/2.mp3");
  });

  it("nextTrack stops at the end of the shuffle order", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      shuffle: true,
      shuffleOrder: [1, 2, 0],
      shufflePos: 2,
      isPlaying: true,
    });
    expect(await p.nextTrack()).toBe("ended");
    expect(nativeAudioStop).toHaveBeenCalledOnce();
  });

  it("prevTrack steps back through the shuffle order", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 2,
      shuffle: true,
      shuffleOrder: [1, 2, 0],
      shufflePos: 1,
      isPlaying: true,
    });
    expect(await p.prevTrack()).toBe("played");
    expect(p.shufflePos).toBe(0);
    expect(p.currentIndex).toBe(1);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/1.mp3");
  });
});

describe("player.toggleLike", () => {
  beforeEach(() => vi.clearAllMocks());

  it("currentTrack returns the queued track at the current index", () => {
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 1 });
    expect(p.currentTrack?.path).toBe("/m/1.mp3");
  });

  it("currentTrack is null when nothing is loaded", () => {
    const p = usePlayerStore();
    expect(p.currentTrack).toBeNull();
  });

  it("toggleLike calls toggle_liked and updates the current track's liked flag", async () => {
    (toggleLiked as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 0 });
    await p.toggleLike();
    expect(toggleLiked).toHaveBeenCalledWith("/m/0.mp3");
    expect(p.currentTrack?.liked).toBe(true);
  });

  it("toggleLike is a no-op with no current track", async () => {
    const p = usePlayerStore();
    await p.toggleLike();
    expect(toggleLiked).not.toHaveBeenCalled();
  });
});

describe("player.repeat", () => {
  beforeEach(() => vi.clearAllMocks());

  it("cycleRepeat rotates off -> queue -> track -> off", () => {
    const p = usePlayerStore();
    expect(p.repeatMode).toBe("off");
    p.cycleRepeat();
    expect(p.repeatMode).toBe("queue");
    p.cycleRepeat();
    expect(p.repeatMode).toBe("track");
    p.cycleRepeat();
    expect(p.repeatMode).toBe("off");
  });

  it("nextTrack with repeat 'track' replays the current track", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 1,
      repeatMode: "track",
      isPlaying: true,
    });
    const result = await p.nextTrack();
    expect(result).toBe("played");
    expect(p.currentIndex).toBe(1);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/1.mp3");
  });

  it("nextTrack at the end with repeat 'queue' wraps to the start", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 2,
      repeatMode: "queue",
      isPlaying: true,
    });
    const result = await p.nextTrack();
    expect(result).toBe("played");
    expect(p.currentIndex).toBe(0);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/0.mp3");
    expect(nativeAudioStop).not.toHaveBeenCalled();
  });

  it("nextTrack at the end of the shuffle order with repeat 'queue' wraps", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      shuffle: true,
      shuffleOrder: [1, 2, 0],
      shufflePos: 2,
      repeatMode: "queue",
      isPlaying: true,
    });
    const result = await p.nextTrack();
    expect(result).toBe("played");
    expect(p.shufflePos).toBe(0);
    expect(p.currentIndex).toBe(1);
  });

  it("prevTrack at the start with repeat 'queue' wraps to the last track", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      repeatMode: "queue",
      isPlaying: true,
    });
    const result = await p.prevTrack();
    expect(result).toBe("played");
    expect(p.currentIndex).toBe(2);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/2.mp3");
  });
});

describe("player.setVolume / toggleMute", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setVolume on native applies the level via nativeAudioSetVolume", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true });
    await p.setVolume(0.5);
    expect(nativeAudioSetVolume).toHaveBeenCalledWith(0.5);
    expect(p.volume).toBe(0.5);
  });

  it("setVolume clamps to [0, 1]", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true });
    await p.setVolume(5);
    expect(p.volume).toBe(1);
    expect(nativeAudioSetVolume).toHaveBeenLastCalledWith(1);
    await p.setVolume(-2);
    expect(p.volume).toBe(0);
    expect(nativeAudioSetVolume).toHaveBeenLastCalledWith(0);
  });

  it("setVolume on web applies via webDriver.setVolume", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "web" });
    await p.setVolume(0.4);
    expect(webDriver.setVolume).toHaveBeenCalledWith(0.4);
    expect(p.volume).toBe(0.4);
  });

  it("toggleMute silences then restores the stored volume", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, volume: 0.8, muted: false });
    await p.toggleMute();
    expect(p.muted).toBe(true);
    expect(nativeAudioSetVolume).toHaveBeenLastCalledWith(0);
    await p.toggleMute();
    expect(p.muted).toBe(false);
    expect(nativeAudioSetVolume).toHaveBeenLastCalledWith(0.8);
    expect(p.volume).toBe(0.8);
  });

  it("changing volume while muted unmutes", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, muted: true });
    await p.setVolume(0.3);
    expect(p.muted).toBe(false);
    expect(nativeAudioSetVolume).toHaveBeenLastCalledWith(0.3);
  });
});
