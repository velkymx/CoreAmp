<template>
  <div class="settings-view p-3 overflow-auto h-100">
    <h1 class="h4 mb-3">Settings</h1>

    <section class="mb-4" style="max-width: 32rem">
      <div class="mb-2">
        <label class="form-label">Scan interval (seconds)</label>
        <VibeFormInput
          v-model="scanInterval"
          type="number"
          aria-label="Scan interval seconds"
          data-test="scan-interval"
        />
      </div>
      <div class="mb-2">
        <label class="form-label">API proxy</label>
        <VibeFormInput
          v-model="apiProxy"
          placeholder="http://host:port (optional)"
          aria-label="API proxy"
          data-test="api-proxy"
        />
      </div>
      <VibeButton variant="primary" data-test="settings-save" @click="onSave">
        Save settings
      </VibeButton>
    </section>

    <hr />

    <section class="mb-4">
      <h2 class="h6 text-secondary text-uppercase">Library</h2>
      <div class="d-flex gap-2 flex-wrap">
        <VibeButton variant="secondary" outline data-test="scan-library" @click="onScan">
          Scan library
        </VibeButton>
        <VibeButton variant="secondary" outline data-test="add-folders" @click="onAddFolders">
          Add folders…
        </VibeButton>
        <VibeButton variant="secondary" outline data-test="choose-files" @click="onChooseFiles">
          Choose files…
        </VibeButton>
        <VibeButton variant="secondary" outline data-test="prune-missing" @click="onPruneMissing">
          Remove missing tracks
        </VibeButton>
        <VibeButton variant="danger" outline data-test="clear-history" @click="onClearHistory">
          Clear play history
        </VibeButton>
      </div>

      <div class="d-flex gap-2 mt-2" style="max-width: 32rem">
        <VibeFormInput
          v-model="importPath"
          placeholder="/path/to/file-or-folder"
          aria-label="Import a file or folder path"
          data-test="import-path"
          class="flex-grow-1"
          @keyup.enter="onImportPath"
        />
        <VibeButton
          variant="secondary"
          outline
          :disabled="!importPath.trim()"
          data-test="import-path-go"
          @click="onImportPath"
        >
          Import path
        </VibeButton>
      </div>
      <div
        class="import-dropzone border rounded p-3 text-center text-secondary mt-2"
        :class="{ dragging }"
        data-test="import-dropzone"
      >
        Drop audio files or folders here to import
      </div>
    </section>

    <div v-if="status || busy" class="d-flex align-items-center gap-2">
      <span
        v-if="busy"
        class="spinner-border spinner-border-sm text-secondary"
        role="status"
        aria-hidden="true"
        data-test="import-spinner"
      ></span>
      <p v-if="status" class="text-secondary small mb-0" data-test="settings-status">{{ status }}</p>
    </div>
    <p class="text-secondary small">CoreAmp {{ version }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import * as api from "@/api/tauri";
import { useNotify } from "@/composables/useNotify";

const { run } = useNotify();

const scanInterval = ref("");
const apiProxy = ref("");
const importPath = ref("");
const version = ref("");
const status = ref("");
const dragging = ref(false);
const busy = ref(false);

// Show the spinner while a scan/import is in flight. Reference-counted so
// overlapping operations don't clear it early.
let busyCount = 0;
async function track<T>(p: Promise<T>): Promise<T> {
  busyCount += 1;
  busy.value = true;
  try {
    return await p;
  } finally {
    busyCount -= 1;
    if (busyCount === 0) busy.value = false;
  }
}

// Scan whatever paths were dropped onto the window. The scanner ignores
// non-audio files (e.g. a stray .m3u), so dropping a mixed selection is safe.
async function importDropped(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  status.value = "Importing dropped items…";
  const result = await track(run(() => api.scanPaths(paths), {
    errorPrefix: "Import failed",
  }));
  if (result) {
    status.value = `Imported ${result.files_upserted} file(s) from ${paths.length} dropped item(s).`;
  }
}
defineExpose({ importDropped });

// OS-level file drops arrive through Tauri's webview drag-drop event (HTML5
// drag events don't expose real paths in the webview). Guarded so it's a no-op
// outside a Tauri webview (tests, plain browser dev).
let unlistenDrop: (() => void) | undefined;
onMounted(async () => {
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    unlistenDrop = await getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload;
      if (payload.type === "over" || payload.type === "enter") {
        dragging.value = true;
      } else if (payload.type === "drop") {
        dragging.value = false;
        void importDropped(payload.paths);
      } else {
        dragging.value = false;
      }
    });
  } catch {
    // Not inside a Tauri webview; drag-drop import unavailable.
  }
});
onBeforeUnmount(() => unlistenDrop?.());

onMounted(() =>
  run(
    async () => {
      const [settings, ver] = await Promise.all([
        api.getSettings(),
        api.appVersion(),
      ]);
      scanInterval.value = String(settings.scan_interval_secs);
      apiProxy.value = settings.api_proxy ?? "";
      version.value = ver;
    },
    { errorPrefix: "Couldn't load settings" },
  ),
);

async function onSave(): Promise<void> {
  const secs = Number.parseInt(scanInterval.value, 10);
  if (!Number.isFinite(secs) || secs <= 0) {
    status.value = "Scan interval must be a positive number of seconds.";
    return;
  }
  await run(() => api.saveSettings(secs, apiProxy.value.trim() || null), {
    errorPrefix: "Save failed",
    success: "Settings saved.",
  });
  status.value = "Settings saved.";
}

async function onScan(): Promise<void> {
  status.value = "Scanning…";
  const result = await track(run(() => api.scanLibrary(), {
    errorPrefix: "Scan failed",
  }));
  if (result) {
    status.value = `Scan complete: ${result.files_upserted} of ${result.files_discovered} files updated.`;
  }
}

async function onAddFolders(): Promise<void> {
  const paths = await run(() => api.pickScanPaths("folder"), {
    errorPrefix: "Folder picker failed",
  });
  if (!paths || paths.length === 0) return;
  status.value = "Scanning new folders…";
  const result = await track(run(() => api.scanPaths(paths), {
    errorPrefix: "Scan failed",
  }));
  if (result) {
    status.value = `Added ${result.files_upserted} files from ${result.roots_scanned} folder(s).`;
  }
}

async function onImportPath(): Promise<void> {
  const path = importPath.value.trim();
  if (!path) return;
  status.value = "Importing path…";
  const result = await track(run(() => api.scanPaths([path]), {
    errorPrefix: "Import failed",
  }));
  if (result) {
    status.value = `Imported ${result.files_upserted} file(s) from "${path}".`;
    importPath.value = "";
  }
}

async function onChooseFiles(): Promise<void> {
  const paths = await run(() => api.pickScanPaths("file"), {
    errorPrefix: "File picker failed",
  });
  if (!paths || paths.length === 0) return;
  status.value = "Importing files…";
  const result = await track(run(() => api.scanPaths(paths), {
    errorPrefix: "Import failed",
  }));
  if (result) {
    status.value = `Imported ${result.files_upserted} of ${paths.length} file(s).`;
  }
}

async function onPruneMissing(): Promise<void> {
  status.value = "Checking library…";
  const removed = await run(() => api.pruneMissingFiles(), {
    errorPrefix: "Couldn't clean up library",
  });
  if (removed !== undefined) {
    status.value =
      removed > 0
        ? `Removed ${removed} missing track(s) from the library.`
        : "No missing tracks found.";
  }
}

async function onClearHistory(): Promise<void> {
  await run(() => api.clearHistory(), {
    errorPrefix: "Couldn't clear history",
    success: "Play history cleared.",
  });
  status.value = "Play history cleared.";
}
</script>

<style scoped>
.import-dropzone {
  border-style: dashed !important;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.import-dropzone.dragging {
  background: rgba(13, 110, 253, 0.12);
  border-color: var(--bs-primary, #0d6efd) !important;
  color: var(--bs-primary, #0d6efd);
}
</style>
