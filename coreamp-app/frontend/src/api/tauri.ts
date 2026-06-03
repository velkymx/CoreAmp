import { invoke } from "@tauri-apps/api/core";
import type {
  NativeOutputDevice,
  NativeStatus,
  TrackArtwork,
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
