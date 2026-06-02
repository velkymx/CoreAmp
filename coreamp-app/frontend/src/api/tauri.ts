import { invoke } from "@tauri-apps/api/core";
import type { NativeStatus } from "@/types";

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
