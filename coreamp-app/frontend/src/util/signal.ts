import type { TrackArtwork, TrackSignalDetails } from "@/types";

// Map a raw channel count to a human label: Mono / Stereo / Nch.
function channelLabel(channels: number): string {
  if (channels === 1) return "Mono";
  if (channels === 2) return "Stereo";
  return `${channels}ch`;
}

// Render signal details as a compact " · "-joined line (e.g.
// "FLAC · 44.1 kHz · 16-bit · Stereo · 1411 kbps"). Null fields are dropped.
export function formatSignal(details: TrackSignalDetails | null): string {
  if (!details) return "";
  const parts: string[] = [details.format];
  if (details.sample_rate_hz != null) {
    parts.push(`${(details.sample_rate_hz / 1000).toFixed(1)} kHz`);
  }
  if (details.bit_depth != null) parts.push(`${details.bit_depth}-bit`);
  if (details.channels != null) parts.push(channelLabel(details.channels));
  if (details.bitrate_kbps != null) parts.push(`${details.bitrate_kbps} kbps`);
  return parts.join(" · ");
}

// Build a displayable data URL from embedded artwork bytes.
export function artworkUrl(artwork: TrackArtwork | null): string | null {
  if (!artwork) return null;
  return `data:${artwork.mime_type};base64,${artwork.data_base64}`;
}
