export type Source = "native" | "web";

export interface Track {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
  liked: boolean;
}

export interface TrackArtwork {
  mime_type: string;
  data_base64: string;
}

export interface TrackSignalDetails {
  format: string;
  sample_rate_hz: number | null;
  bit_depth: number | null;
  channels: number | null;
  bitrate_kbps: number | null;
}

export interface NativeOutputDevice {
  name: string;
  is_default: boolean;
  channels: number | null;
  sample_rate_hz: number | null;
  sample_format: string | null;
}

export interface NativeStatus {
  available: boolean;
  active: boolean;
  paused: boolean;
  finished: boolean;
  current_path: string | null;
  detail: string | null;
  position_secs: number | null;
  duration_secs: number | null;
}
