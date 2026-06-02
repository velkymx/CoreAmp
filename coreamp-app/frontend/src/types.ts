export type Source = "native" | "web";

export interface Track {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
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
