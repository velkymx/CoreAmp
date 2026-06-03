import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/tauri", () => ({
  nativeAudioSetDspSettings: vi.fn().mockResolvedValue(undefined),
}));

import { nativeAudioSetDspSettings } from "@/api/tauri";
import { useAudioStore, EQ_FREQUENCIES } from "@/stores/audio";

describe("audio store", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts with a flat 5-band EQ matching the fixed frequencies", () => {
    const a = useAudioStore();
    expect(a.bands.map((b) => b.frequency)).toEqual([...EQ_FREQUENCIES]);
    expect(a.bands.every((b) => b.gain === 0)).toBe(true);
  });

  it("setBandGain pushes settings and clamps to ±24 dB", async () => {
    const a = useAudioStore();
    await a.setBandGain(0, 99);
    expect(a.bands[0].gain).toBe(24);
    expect(nativeAudioSetDspSettings).toHaveBeenCalledWith(
      expect.objectContaining({ eq_bands: expect.any(Array) }),
    );
  });

  it("a manual gain edit clears the named preset", async () => {
    const a = useAudioStore();
    await a.applyPreset("Warm");
    expect(a.preset).toBe("Warm");
    await a.setBandGain(2, 3);
    expect(a.preset).toBe("Flat");
  });

  it("applyPreset sets the band gains and enables the EQ", async () => {
    const a = useAudioStore();
    await a.applyPreset("Bass Cut");
    expect(a.bands[0].gain).toBe(-8);
    expect(a.eqEnabled).toBe(true);
    expect(nativeAudioSetDspSettings).toHaveBeenCalled();
  });

  it("cycleBoost rotates Off -> + -> ++ -> Off with labels", async () => {
    const a = useAudioStore();
    expect(a.boostLabel).toBe("Boost Off");
    await a.cycleBoost();
    expect(a.boostLabel).toBe("Boost+");
    await a.cycleBoost();
    expect(a.boostLabel).toBe("Boost++");
    await a.cycleBoost();
    expect(a.boostLevel).toBe(0);
  });

  it("dspSettings mirrors the full chain state", async () => {
    const a = useAudioStore();
    a.$patch({ eqEnabled: true, preampDb: 3, limiterEnabled: false, crossfeedEnabled: true });
    expect(a.dspSettings).toMatchObject({
      eq_enabled: true,
      preamp_db: 3,
      limiter_enabled: false,
      crossfeed_enabled: true,
    });
    expect(a.dspSettings.eq_bands).toHaveLength(5);
  });

  it("setPreamp clamps to ±18 dB and pushes", async () => {
    const a = useAudioStore();
    await a.setPreamp(50);
    expect(a.preampDb).toBe(18);
    expect(nativeAudioSetDspSettings).toHaveBeenCalled();
  });
});
