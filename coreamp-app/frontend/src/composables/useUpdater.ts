import { ref } from "vue";
import { check, type Update } from "@tauri-apps/plugin-updater";
import * as api from "@/api/tauri";
import { errorMessage } from "@/stores/notify";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "none"
  | "downloading"
  | "error";

// Wraps the Tauri updater plugin: check GitHub for a newer signed release, then
// download + install it and relaunch. State is exposed reactively so Settings
// can render progress without owning any of the plugin logic.
export function useUpdater() {
  const status = ref<UpdateStatus>("idle");
  const version = ref<string | null>(null);
  const notes = ref<string | null>(null);
  const error = ref<string | null>(null);
  const progress = ref(0); // 0..1 during download

  let pending: Update | null = null;

  async function checkForUpdate(): Promise<void> {
    status.value = "checking";
    error.value = null;
    try {
      pending = await check();
      if (pending) {
        version.value = pending.version;
        notes.value = pending.body ?? null;
        status.value = "available";
      } else {
        version.value = null;
        notes.value = null;
        status.value = "none";
      }
    } catch (err) {
      error.value = errorMessage(err);
      status.value = "error";
    }
  }

  async function installUpdate(): Promise<void> {
    if (!pending) return;
    status.value = "downloading";
    progress.value = 0;
    error.value = null;
    let downloaded = 0;
    let total = 0;
    try {
      await pending.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? 0;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) progress.value = downloaded / total;
        } else if (event.event === "Finished") {
          progress.value = 1;
        }
      });
      // Installed — relaunch into the new version.
      await api.restartApp();
    } catch (err) {
      error.value = errorMessage(err);
      status.value = "error";
    }
  }

  return { status, version, notes, error, progress, checkForUpdate, installUpdate };
}
