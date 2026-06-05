import { describe, it, expect } from "vitest";
import { formatSignal, artworkUrl } from "@/util/signal";
import type { TrackSignalDetails } from "@/types";

const base: TrackSignalDetails = {
  format: "FLAC",
  sample_rate_hz: 44100,
  bit_depth: 16,
  channels: 2,
  bitrate_kbps: 1411,
};

describe("formatSignal", () => {
  it("joins all present fields with a middot", () => {
    expect(formatSignal(base)).toBe("FLAC · 44.1 kHz · 16-bit · Stereo · 1411 kbps");
  });

  it("labels single channel as Mono and >2 as channel count", () => {
    expect(formatSignal({ ...base, channels: 1 })).toContain("Mono");
    expect(formatSignal({ ...base, channels: 6 })).toContain("6ch");
  });

  it("drops fields that are null", () => {
    expect(
      formatSignal({
        format: "MP3",
        sample_rate_hz: 48000,
        bit_depth: null,
        channels: 2,
        bitrate_kbps: null,
      }),
    ).toBe("MP3 · 48.0 kHz · Stereo");
  });

  it("returns empty string for null details", () => {
    expect(formatSignal(null)).toBe("");
  });
});

describe("artworkUrl", () => {
  it("builds a data URL from mime + base64", () => {
    expect(artworkUrl({ mime_type: "image/jpeg", data_base64: "AAAA" })).toBe(
      "data:image/jpeg;base64,AAAA",
    );
  });

  it("returns null for null artwork", () => {
    expect(artworkUrl(null)).toBeNull();
  });
});
