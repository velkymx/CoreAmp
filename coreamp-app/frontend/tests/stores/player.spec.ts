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
  readTrackArtwork: vi.fn().mockResolvedValue(null),
  readTrackSignalDetails: vi.fn().mockResolvedValue(null),
  listNativeOutputDevices: vi.fn().mockResolvedValue([]),
  nativeAudioSelectedOutputDevice: vi.fn().mockResolvedValue({ selected_name: null }),
  nativeAudioSetOutputDevice: vi.fn().mockResolvedValue(undefined),
  recordPlay: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    load: vi.fn(),
    isLoaded: vi.fn(() => false),
    isPaused: vi.fn(() => true),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
    seek: vi.fn(),
    setVolume: vi.fn(),
    position: vi.fn(() => 0),
    duration: vi.fn(() => 0),
    hasEnded: vi.fn(() => false),
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
  readTrackArtwork,
  readTrackSignalDetails,
  listNativeOutputDevices,
  nativeAudioSelectedOutputDevice,
  nativeAudioSetOutputDevice,
} from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";
import { usePlayerStore } from "@/stores/player";
import type { TrackArtwork, TrackSignalDetails } from "@/types";

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

  it("refreshStatus reads position/duration from the web element", async () => {
    (webDriver.position as ReturnType<typeof vi.fn>).mockReturnValue(12);
    (webDriver.duration as ReturnType<typeof vi.fn>).mockReturnValue(200);
    (webDriver.hasEnded as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const p = usePlayerStore();
    p.$patch({ source: "web" });
    await p.refreshStatus();
    expect(p.positionSecs).toBe(12);
    expect(p.durationSecs).toBe(200);
    expect(nativeAudioStatus).not.toHaveBeenCalled();
  });

  it("refreshStatus advances the queue when the web track ends", async () => {
    (webDriver.hasEnded as ReturnType<typeof vi.fn>).mockReturnValue(true);
    const p = usePlayerStore();
    p.$patch({ source: "web", isPlaying: true, queue: mkQueue(), currentIndex: 0 });
    const spy = vi.spyOn(p, "nextTrack");
    await p.refreshStatus();
    expect(spy).toHaveBeenCalledOnce();
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

describe("player.loadNowPlayingMeta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches artwork + signal for the current track and stores them", async () => {
    const art = { mime_type: "image/jpeg", data_base64: "AAAA" };
    const sig = {
      format: "FLAC",
      sample_rate_hz: 44100,
      bit_depth: 16,
      channels: 2,
      bitrate_kbps: 1411,
    };
    vi.mocked(readTrackArtwork).mockResolvedValue(art);
    vi.mocked(readTrackSignalDetails).mockResolvedValue(sig);
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 0 });
    await p.loadNowPlayingMeta();
    expect(readTrackArtwork).toHaveBeenCalledWith("/m/0.mp3", 256);
    expect(readTrackSignalDetails).toHaveBeenCalledWith("/m/0.mp3");
    expect(p.artwork).toEqual(art);
    expect(p.signal).toEqual(sig);
  });

  it("clears metadata and makes no calls when nothing is current", async () => {
    const p = usePlayerStore();
    p.$patch({ artwork: { mime_type: "x", data_base64: "y" } });
    await p.loadNowPlayingMeta();
    expect(readTrackArtwork).not.toHaveBeenCalled();
    expect(p.artwork).toBeNull();
    expect(p.signal).toBeNull();
  });

  it("ignores a stale response when the track changed mid-flight", async () => {
    let resolveArt: (v: TrackArtwork | null) => void = () => {};
    vi.mocked(readTrackArtwork).mockImplementation(
      () => new Promise<TrackArtwork | null>((r) => (resolveArt = r)),
    );
    vi.mocked(readTrackSignalDetails).mockResolvedValue(
      null as unknown as TrackSignalDetails,
    );
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 0 });
    const first = p.loadNowPlayingMeta();
    // Track changes before the first fetch resolves; a newer load wins.
    p.$patch({ currentIndex: 1 });
    vi.mocked(readTrackArtwork).mockResolvedValue({
      mime_type: "image/png",
      data_base64: "NEW",
    });
    await p.loadNowPlayingMeta();
    resolveArt({ mime_type: "image/jpeg", data_base64: "OLD" });
    await first;
    expect(p.artwork?.data_base64).toBe("NEW");
  });

  it("swallows backend errors and leaves metadata cleared", async () => {
    vi.mocked(readTrackArtwork).mockRejectedValue(new Error("boom"));
    vi.mocked(readTrackSignalDetails).mockRejectedValue(new Error("boom"));
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 0 });
    await expect(p.loadNowPlayingMeta()).resolves.toBeUndefined();
    expect(p.artwork).toBeNull();
    expect(p.signal).toBeNull();
  });
});

describe("player.output devices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dev = (name: string, is_default = false) => ({
    name,
    is_default,
    channels: 2,
    sample_rate_hz: 48000,
    sample_format: "f32",
  });

  it("loadOutputDevices stores the device list and current selection", async () => {
    vi.mocked(listNativeOutputDevices).mockResolvedValue([
      dev("Built-in", true),
      dev("DAC"),
    ]);
    vi.mocked(nativeAudioSelectedOutputDevice).mockResolvedValue({
      selected_name: "DAC",
    });
    const p = usePlayerStore();
    await p.loadOutputDevices();
    expect(p.outputDevices.map((d) => d.name)).toEqual(["Built-in", "DAC"]);
    expect(p.selectedOutputDevice).toBe("DAC");
  });

  it("setOutputDevice forwards the name and updates the selection", async () => {
    const p = usePlayerStore();
    await p.setOutputDevice("DAC");
    expect(nativeAudioSetOutputDevice).toHaveBeenCalledWith("DAC");
    expect(p.selectedOutputDevice).toBe("DAC");
  });

  it("setOutputDevice(null) selects the system default", async () => {
    const p = usePlayerStore();
    p.$patch({ selectedOutputDevice: "DAC" });
    await p.setOutputDevice(null);
    expect(nativeAudioSetOutputDevice).toHaveBeenCalledWith(null);
    expect(p.selectedOutputDevice).toBeNull();
  });

  it("setOutputDevice keeps the prior selection if the backend rejects", async () => {
    vi.mocked(nativeAudioSetOutputDevice).mockRejectedValueOnce(new Error("busy"));
    const p = usePlayerStore();
    p.$patch({ selectedOutputDevice: "Built-in" });
    await expect(p.setOutputDevice("DAC")).rejects.toThrow("busy");
    expect(p.selectedOutputDevice).toBe("Built-in");
  });
});

describe("player.playTracks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("replaces the queue and plays from the chosen index", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true });
    await p.playTracks(mkQueue(), 2);
    expect(p.queue).toHaveLength(3);
    expect(p.currentIndex).toBe(2);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/2.mp3");
    expect(p.isPlaying).toBe(true);
  });

  it("clamps an out-of-range start index", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true });
    await p.playTracks(mkQueue(), 99);
    expect(p.currentIndex).toBe(2);
  });

  it("ignores an empty track list", async () => {
    const p = usePlayerStore();
    await p.playTracks([], 0);
    expect(p.queue).toHaveLength(0);
    expect(nativeAudioPlay).not.toHaveBeenCalled();
  });

  it("rebuilds a current-first shuffle order when shuffle is on", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, shuffle: true });
    await p.playTracks(mkQueue(), 1);
    expect(p.shuffleOrder[0]).toBe(1);
    expect(p.shuffleOrder).toHaveLength(3);
  });
});

describe("player queue management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("enqueue appends and sets a current track when none", () => {
    const p = usePlayerStore();
    p.enqueue(mkQueue()[0]);
    expect(p.queue).toHaveLength(1);
    expect(p.currentIndex).toBe(0);
  });

  it("playNext inserts right after the current track", () => {
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 0 });
    p.playNext({ path: "/m/x.mp3", title: "X", artist: null, album: null, liked: false });
    expect(p.queue[1].path).toBe("/m/x.mp3");
  });

  it("removeAt before current shifts currentIndex down", () => {
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 2 });
    p.removeAt(0);
    expect(p.queue).toHaveLength(2);
    expect(p.currentIndex).toBe(1);
  });

  it("moveInQueue keeps the playing track selected", () => {
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 0 });
    p.moveInQueue(0, 2);
    expect(p.currentIndex).toBe(2);
    expect(p.queue[2].path).toBe("/m/0.mp3");
  });

  it("clearPlayed drops everything before current", () => {
    const p = usePlayerStore();
    p.$patch({ queue: mkQueue(), currentIndex: 2 });
    p.clearPlayed();
    expect(p.queue).toHaveLength(1);
    expect(p.currentIndex).toBe(0);
  });

  it("jumpTo plays the chosen index", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, queue: mkQueue(), currentIndex: 0 });
    await p.jumpTo(2);
    expect(p.currentIndex).toBe(2);
    expect(nativeAudioPlay).toHaveBeenCalledWith("/m/2.mp3");
  });

  it("stopAfterCurrent makes the next advance stop once", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, queue: mkQueue(), currentIndex: 0 });
    p.toggleStopAfterCurrent();
    expect(await p.nextTrack()).toBe("ended");
    expect(nativeAudioStop).toHaveBeenCalledOnce();
    expect(p.stopAfterCurrent).toBe(false);
    expect(await p.nextTrack()).toBe("played");
  });
});

describe("player.init", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("forces the web output path and disables native", () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true });
    p.init();
    expect(p.source).toBe("web");
    expect(p.nativeAvailable).toBe(false);
  });

  it("web playback loads the file before resuming", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "web",
      nativeAvailable: false,
      queue: mkQueue(),
      currentIndex: 0,
    });
    await p.playCurrent();
    expect(webDriver.load).toHaveBeenCalledWith("/m/0.mp3");
    expect(webDriver.resume).toHaveBeenCalled();
  });
});

describe("player.setSource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (webDriver.isLoaded as ReturnType<typeof vi.fn>).mockReturnValue(false);
  });

  it("switching to web stops native and restarts current on web", async () => {
    const p = usePlayerStore();
    p.$patch({
      source: "native",
      nativeAvailable: true,
      queue: mkQueue(),
      currentIndex: 0,
      isPlaying: true,
    });
    await p.setSource("web");
    expect(nativeAudioStop).toHaveBeenCalledOnce();
    expect(p.source).toBe("web");
    expect(webDriver.load).toHaveBeenCalledWith("/m/0.mp3");
    expect(webDriver.resume).toHaveBeenCalled();
  });

  it("does not restart when nothing was playing", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: false });
    await p.setSource("web");
    expect(p.source).toBe("web");
    expect(webDriver.resume).not.toHaveBeenCalled();
  });

  it("refuses native when unavailable", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "web", nativeAvailable: false });
    await p.setSource("native");
    expect(p.source).toBe("web");
  });

  it("is a no-op when the source is unchanged", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "web" });
    await p.setSource("web");
    expect(nativeAudioStop).not.toHaveBeenCalled();
  });
});
