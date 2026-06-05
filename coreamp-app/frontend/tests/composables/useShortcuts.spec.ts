import { describe, it, expect, vi } from "vitest";
import { applyShortcut, shouldIgnoreTarget } from "@/composables/useShortcuts";

function fakePlayer() {
  return {
    positionSecs: 30,
    volume: 0.5,
    togglePlayback: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    toggleMute: vi.fn(),
    toggleShuffle: vi.fn(),
    cycleRepeat: vi.fn(),
  };
}

describe("applyShortcut", () => {
  it("space toggles playback", () => {
    const p = fakePlayer();
    expect(applyShortcut(p as never, " ")).toBe(true);
    expect(p.togglePlayback).toHaveBeenCalledOnce();
  });

  it("arrows seek ±5s (left clamps at 0) and change volume ±0.05", () => {
    const p = fakePlayer();
    applyShortcut(p as never, "ArrowRight");
    expect(p.seek).toHaveBeenCalledWith(35);
    applyShortcut(p as never, "ArrowLeft");
    expect(p.seek).toHaveBeenLastCalledWith(25);
    applyShortcut(p as never, "ArrowUp");
    expect(p.setVolume).toHaveBeenCalledWith(0.55);
    applyShortcut(p as never, "ArrowDown");
    expect(p.setVolume).toHaveBeenLastCalledWith(0.45);
  });

  it("n/p change track, m mutes, s shuffles, r repeats", () => {
    const p = fakePlayer();
    applyShortcut(p as never, "n");
    applyShortcut(p as never, "p");
    applyShortcut(p as never, "m");
    applyShortcut(p as never, "s");
    applyShortcut(p as never, "r");
    expect(p.nextTrack).toHaveBeenCalledOnce();
    expect(p.prevTrack).toHaveBeenCalledOnce();
    expect(p.toggleMute).toHaveBeenCalledOnce();
    expect(p.toggleShuffle).toHaveBeenCalledOnce();
    expect(p.cycleRepeat).toHaveBeenCalledOnce();
  });

  it("returns false for unmapped keys", () => {
    expect(applyShortcut(fakePlayer() as never, "q")).toBe(false);
  });
});

describe("shouldIgnoreTarget", () => {
  it("ignores form fields and contenteditable", () => {
    expect(shouldIgnoreTarget({ tagName: "INPUT" } as never)).toBe(true);
    expect(shouldIgnoreTarget({ tagName: "TEXTAREA" } as never)).toBe(true);
    expect(shouldIgnoreTarget({ tagName: "SELECT" } as never)).toBe(true);
    expect(
      shouldIgnoreTarget({ tagName: "DIV", isContentEditable: true } as never),
    ).toBe(true);
  });

  it("ignores keys aimed at a focused visualizer/game", () => {
    const el = {
      tagName: "CANVAS",
      isContentEditable: false,
      closest: (sel: string) => (sel.includes("visualizer") ? {} : null),
    };
    expect(shouldIgnoreTarget(el as never)).toBe(true);
  });

  it("allows plain keys elsewhere", () => {
    const el = { tagName: "BODY", isContentEditable: false, closest: () => null };
    expect(shouldIgnoreTarget(el as never)).toBe(false);
  });
});
