import { invoke } from "@tauri-apps/api/core";
import type {
  AlbumSummary,
  AppSettings,
  ArtistSummary,
  GenreSummary,
  LibraryTrack,
  NativeDspSettings,
  NativeOutputDevice,
  NativeStatus,
  PlaylistSummary,
  ScanResult,
  TrackArtwork,
  TrackMetadataInput,
  TrackSignalDetails,
} from "@/types";

export class TauriError extends Error {
  command: string;
  constructor(command: string, message: string) {
    super(message);
    this.name = "TauriError";
    this.command = command;
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return (await (args !== undefined
      ? invoke<T>(command, args)
      : invoke<T>(command))) as T;
  } catch (err) {
    throw new TauriError(command, String(err));
  }
}

export const nativeAudioStatus = () => call<NativeStatus>("native_audio_status");
export const nativeAudioPause = () => call<void>("native_audio_pause");
export const nativeAudioResume = () => call<void>("native_audio_resume");
export const nativeAudioStop = () => call<void>("native_audio_stop");
export const nativeAudioPlay = (path: string) =>
  call<void>("native_audio_play", { path });
export const nativeAudioSeek = (secs: number) =>
  call<void>("native_audio_seek", { secs });
export const nativeAudioSetVolume = (volume: number) =>
  call<void>("native_audio_set_volume", { volume });
export const toggleLiked = (path: string) =>
  call<boolean>("toggle_liked", { path });
export const setRating = (path: string, rating: number) =>
  call<number>("set_rating", { path, rating });
export const setTrackArtwork = (trackPath: string, imagePath: string) =>
  call<boolean>("set_track_artwork", { trackPath, imagePath });
export const readTrackArtwork = (path: string, maxSize?: number) =>
  call<TrackArtwork | null>("read_track_artwork", { path, maxSize });
export const readTrackSignalDetails = (path: string) =>
  call<TrackSignalDetails>("read_track_signal_details", { path });
export const listNativeOutputDevices = () =>
  call<NativeOutputDevice[]>("list_native_output_devices");
export const nativeAudioSelectedOutputDevice = () =>
  call<{ selected_name: string | null }>("native_audio_selected_output_device");
export const nativeAudioSetOutputDevice = (name: string | null) =>
  call<void>("native_audio_set_output_device", { name });

// --- Library ---
export interface ListLibraryArgs {
  limit?: number;
  offset?: number;
  genre?: string | null;
  likedOnly?: boolean;
  search?: string | null;
}
export const listLibrary = (args: ListLibraryArgs = {}) =>
  call<LibraryTrack[]>("list_library", args as Record<string, unknown>);
export const libraryCount = () => call<number>("library_count");
export const pruneMissingFiles = () => call<number>("prune_missing_files");
export const listAlbumTracks = (album: string, artist?: string | null) =>
  call<LibraryTrack[]>("list_album_tracks", { album, artist: artist ?? null });
export interface ReplayGainInfo {
  track: number | null;
  album: number | null;
}
export const readReplayGain = (path: string) =>
  call<ReplayGainInfo>("read_replay_gain", { path });
export const listGenres = () => call<string[]>("list_genres");
export const listArtists = () => call<ArtistSummary[]>("list_artists");
export const listAlbums = () => call<AlbumSummary[]>("list_albums");
export const listGenreSummaries = () =>
  call<GenreSummary[]>("list_genre_summaries");
export const recordPlay = (path: string) => call<void>("record_play", { path });
export const listRecentlyPlayed = (limit: number) =>
  call<LibraryTrack[]>("list_recently_played", { limit });
export const listRecentlyAdded = (limit: number) =>
  call<LibraryTrack[]>("list_recently_added", { limit });
export const listTopArtists = (limit: number) =>
  call<ArtistSummary[]>("list_top_artists", { limit });
export const clearHistory = () => call<void>("clear_history");
export const updateTrackMetadataForPath = (
  path: string,
  metadataInput: TrackMetadataInput,
) => call<LibraryTrack>("update_track_metadata_for_path", { path, metadataInput });
export const writeMissingTagsForPath = (path: string) =>
  call<boolean>("write_missing_tags_for_path", { path });

// --- Playlists ---
export const listPlaylists = () => call<PlaylistSummary[]>("list_playlists");
export const savePlaylist = (name: string, paths: string[]) =>
  call<PlaylistSummary>("save_playlist", { name, paths });
export const appendToPlaylist = (playlistPath: string, paths: string[]) =>
  call<PlaylistSummary>("append_to_playlist", { playlistPath, paths });
export const loadPlaylist = (playlistPath: string) =>
  call<LibraryTrack[]>("load_playlist", { playlistPath });
export const importPlaylistFile = (sourcePath: string) =>
  call<PlaylistSummary>("import_playlist_file", { sourcePath });
export const deletePlaylist = (playlistPath: string) =>
  call<void>("delete_playlist", { playlistPath });
export const dedupPlaylist = (playlistPath: string) =>
  call<PlaylistSummary>("dedup_playlist", { playlistPath });
export const playlistContains = (playlistPath: string, trackPath: string) =>
  call<boolean>("playlist_contains", { playlistPath, trackPath });

// --- Settings / scan / app ---
export const getSettings = () => call<AppSettings>("get_settings");
export const saveSettings = (scanIntervalSecs: number, apiProxy: string | null) =>
  call<void>("save_settings", { scanIntervalSecs, apiProxy });
export const scanLibrary = () => call<ScanResult>("scan_library");
export const scanPaths = (paths: string[]) =>
  call<ScanResult>("scan_paths", { paths });
export const pickScanPaths = (kind: string) =>
  call<string[]>("pick_scan_paths", { kind });
export const appVersion = () => call<string>("app_version");
export const setTrayNowPlaying = (label: string | null) =>
  call<void>("set_tray_now_playing", { label });
export const restartApp = () => call<void>("restart_app");

// --- DSP / EQ ---
export const nativeAudioSetDspSettings = (settings: NativeDspSettings) =>
  call<void>("native_audio_set_dsp_settings", { settings });
