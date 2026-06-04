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
        <VibeButton variant="secondary" outline data-test="prune-missing" @click="onPruneMissing">
          Remove missing tracks
        </VibeButton>
        <VibeButton variant="danger" outline data-test="clear-history" @click="onClearHistory">
          Clear play history
        </VibeButton>
      </div>
    </section>

    <p v-if="status" class="text-secondary small" data-test="settings-status">{{ status }}</p>
    <p class="text-secondary small">CoreAmp {{ version }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import * as api from "@/api/tauri";
import { useNotify } from "@/composables/useNotify";

const { run } = useNotify();

const scanInterval = ref("");
const apiProxy = ref("");
const version = ref("");
const status = ref("");

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
  const result = await run(() => api.scanLibrary(), {
    errorPrefix: "Scan failed",
  });
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
  const result = await run(() => api.scanPaths(paths), {
    errorPrefix: "Scan failed",
  });
  if (result) {
    status.value = `Added ${result.files_upserted} files from ${result.roots_scanned} folder(s).`;
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
