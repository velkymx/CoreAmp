import { describe, it, expect, beforeEach } from "vitest";
import type { Track } from "@/types";
import {
  persistQueue,
  restoreQueue,
  persistQueueIfChanged,
  QUEUE_STORAGE_KEY,
} from "@/util/queueStorage";

function track(path: string): Track {
  return {
    path,
    filename: path,
    artist: null,
    album: null,
    album_artist: null,
    title: path,
    year: null,
    genre: null,
    track_number: null,
    liked: false,
    duration: null,
  } as unknown as Track;
}

describe("queueStorage", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a queue and current index", () => {
    persistQueue([track("/a.mp3"), track("/b.mp3")], 1);
    const restored = restoreQueue();
    expect(restored?.queue.map((t) => t.path)).toEqual(["/a.mp3", "/b.mp3"]);
    expect(restored?.currentIndex).toBe(1);
  });

  it("returns null when nothing is stored", () => {
    expect(restoreQueue()).toBeNull();
  });

  it("returns null and does not throw on corrupt data", () => {
    localStorage.setItem(QUEUE_STORAGE_KEY, "{not json");
    expect(restoreQueue()).toBeNull();
  });

  it("clamps an out-of-range index into the queue", () => {
    persistQueue([track("/a.mp3")], 9);
    expect(restoreQueue()?.currentIndex).toBe(0);
  });

  it("keeps -1 (nothing playing) for a non-empty queue", () => {
    persistQueue([track("/a.mp3")], -1);
    expect(restoreQueue()?.currentIndex).toBe(-1);
  });

  it("normalises an empty queue to index -1", () => {
    persistQueue([], 3);
    expect(restoreQueue()).toEqual({ queue: [], currentIndex: -1 });
  });

  it("persistQueueIfChanged only writes when the queue or index changes", () => {
    persistQueueIfChanged([track("/a.mp3")], 0);
    // Identical call must not rewrite (and must not throw).
    persistQueueIfChanged([track("/a.mp3")], 0);
    expect(restoreQueue()?.queue.map((t) => t.path)).toEqual(["/a.mp3"]);

    // A real change (index moves) is persisted.
    persistQueueIfChanged([track("/a.mp3"), track("/b.mp3")], 1);
    expect(restoreQueue()?.currentIndex).toBe(1);
  });
});
