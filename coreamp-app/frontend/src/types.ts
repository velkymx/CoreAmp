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

export interface LibraryTrack {
  path: string;
  filename: string;
  artist: string | null;
  album: string | null;
  title: string | null;
  year: string | null;
  genre: string | null;
  liked: boolean;
  duration: number | null;
}

export interface ArtistSummary {
  name: string;
  track_count: number;
  representative_path: string;
}

export interface AlbumSummary {
  title: string;
  artist: string | null;
  track_count: number;
  representative_path: string;
}

export interface GenreSummary {
  name: string;
  track_count: number;
  representative_path: string;
}

export interface PlaylistSummary {
  name: string;
  path: string;
  track_count: number;
}

export interface ScanResult {
  roots: string[];
  roots_scanned: number;
  files_discovered: number;
  files_upserted: number;
}

export interface AppSettings {
  scan_interval_secs: number;
  api_proxy: string | null;
}

export interface TrackMetadataInput {
  artist: string | null;
  album: string | null;
  title: string | null;
  year: string | null;
  genre: string | null;
}

export interface EqBand {
  frequency: number;
  gain: number;
  q: number;
}

export interface NativeDspSettings {
  eq_enabled: boolean;
  eq_bands: EqBand[];
  boost_level: number;
  preamp_db: number;
  limiter_enabled: boolean;
  crossfeed_enabled: boolean;
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
