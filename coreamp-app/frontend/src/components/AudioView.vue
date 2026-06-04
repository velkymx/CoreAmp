<template>
  <div class="audio-view p-3 overflow-auto h-100">
    <div class="d-flex align-items-center gap-3 mb-3 flex-wrap">
      <VibeFormSwitch v-model="eqEnabled" label="EQ" data-test="eq-enabled" />
      <VibeFormSelect
        v-model="presetModel"
        :options="presetOptions"
        aria-label="EQ preset"
        data-test="eq-preset"
        style="max-width: 12rem"
      />
      <VibeButton variant="secondary" outline data-test="boost" @click="audio.cycleBoost">
        {{ audio.boostLabel }}
      </VibeButton>
      <label class="d-flex align-items-center gap-2 mb-0">
        <span class="text-secondary small">ReplayGain</span>
        <VibeFormSelect
          v-model="replayGainModel"
          :options="replayGainOptions"
          aria-label="ReplayGain mode"
          data-test="replaygain-mode"
          style="max-width: 9rem"
        />
      </label>
      <VibeFormSwitch v-model="gaplessModel" label="Gapless" data-test="gapless-toggle" />
      <label class="d-flex align-items-center gap-2 mb-0">
        <span class="text-secondary small">Crossfade</span>
        <VibeFormSelect
          v-model="crossfadeModel"
          :options="crossfadeOptions"
          aria-label="Crossfade duration"
          data-test="crossfade-secs"
          style="max-width: 8rem"
        />
      </label>
    </div>

    <div class="d-flex align-items-center gap-2 mb-3 flex-wrap">
      <VibeFormInput
        v-model="newPresetName"
        placeholder="New preset name"
        aria-label="EQ preset name"
        data-test="eq-preset-name"
        style="max-width: 12rem"
      />
      <VibeButton
        variant="secondary"
        outline
        :disabled="!newPresetName.trim()"
        data-test="eq-save-preset"
        @click="onSavePreset"
      >
        Save preset
      </VibeButton>
      <VibeButton
        v-if="selectedUserPreset"
        variant="danger"
        outline
        data-test="eq-delete-preset"
        @click="onDeletePreset"
      >
        Delete “{{ selectedUserPreset }}”
      </VibeButton>
    </div>

    <EqGraph :bands="audio.bands" :freq="freq" />

    <div class="eq-bands d-flex justify-content-between gap-2 mt-3">
      <div
        v-for="(band, i) in audio.bands"
        :key="band.frequency"
        class="eq-band text-center flex-fill"
        data-test="eq-band"
      >
        <div class="small text-secondary">{{ formatHz(band.frequency) }}</div>
        <VibeSlider
          :model-value="band.gain"
          :min="-24"
          :max="24"
          :step="0.5"
          :aria-label="`Gain ${formatHz(band.frequency)}`"
          :data-test="`gain-${i}`"
          @update:model-value="(v: number) => audio.setBandGain(i, v)"
        />
        <div class="small font-monospace">{{ band.gain.toFixed(1) }} dB</div>
        <VibeSlider
          :model-value="band.q"
          :min="0.1"
          :max="12"
          :step="0.1"
          :aria-label="`Q ${formatHz(band.frequency)}`"
          :data-test="`q-${i}`"
          @update:model-value="(v: number) => audio.setBandQ(i, v)"
        />
        <div class="small text-secondary">Q {{ band.q.toFixed(1) }}</div>
      </div>
    </div>

    <hr />

    <h2 class="h6 text-secondary text-uppercase">DSP chain</h2>
    <div class="mb-3" style="max-width: 24rem">
      <label class="form-label small">Preamp {{ audio.preampDb.toFixed(1) }} dB</label>
      <VibeSlider
        :model-value="audio.preampDb"
        :min="-18"
        :max="18"
        :step="0.5"
        aria-label="Preamp"
        data-test="preamp"
        @update:model-value="(v: number) => audio.setPreamp(v)"
      />
    </div>
    <div class="d-flex gap-4 flex-wrap">
      <VibeFormSwitch v-model="limiter" label="Limiter" data-test="limiter" />
      <VibeFormSwitch v-model="crossfeed" label="Crossfeed" data-test="crossfeed" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import EqGraph from "@/components/EqGraph.vue";
import { useAudioStore, type EqPresetName } from "@/stores/audio";
import { usePlayerStore, type ReplayGainMode } from "@/stores/player";
import { useFrequencyData } from "@/composables/useFrequencyData";

const audio = useAudioStore();
const player = usePlayerStore();

const replayGainOptions: FormSelectOption[] = [
  { value: "off", text: "Off" },
  { value: "track", text: "Track" },
  { value: "album", text: "Album" },
];
const replayGainModel = computed<FormSelectOptionValue>({
  get: () => player.replayGainMode,
  set: (value) => player.setReplayGainMode(String(value) as ReplayGainMode),
});
const gaplessModel = computed<boolean>({
  get: () => player.gapless,
  set: (value) => player.setGapless(value),
});

const crossfadeOptions: FormSelectOption[] = [
  { value: 0, text: "Off" },
  { value: 2, text: "2 s" },
  { value: 4, text: "4 s" },
  { value: 6, text: "6 s" },
  { value: 8, text: "8 s" },
  { value: 12, text: "12 s" },
];
const crossfadeModel = computed<FormSelectOptionValue>({
  get: () => player.crossfadeSecs,
  set: (value) => player.setCrossfade(Number(value)),
});
const { freq } = useFrequencyData();

const PRESETS: EqPresetName[] = [
  "Flat",
  "Warm",
  "Presence",
  "V Curve",
  "Bass Cut",
  "Hip-Hop",
  "Dance",
];
const newPresetName = ref("");
// User presets are namespaced "user:<name>" in the select so they don't collide
// with the built-ins.
const presetOptions = computed<FormSelectOption[]>(() => [
  ...PRESETS.map((p) => ({ value: p, text: p })),
  ...audio.userPresets.map((p) => ({ value: `user:${p.name}`, text: `★ ${p.name}` })),
]);

const eqEnabled = computed<boolean>({
  get: () => audio.eqEnabled,
  set: (v) => void audio.setEqEnabled(v),
});

const selection = ref<FormSelectOptionValue>(audio.preset);
const presetModel = computed<FormSelectOptionValue>({
  get: () => selection.value,
  set: (v) => {
    selection.value = v;
    const id = String(v);
    if (id.startsWith("user:")) void audio.applyUserPreset(id.slice(5));
    else void audio.applyPreset(id as EqPresetName);
  },
});

const selectedUserPreset = computed(() => {
  const id = String(selection.value);
  return id.startsWith("user:") ? id.slice(5) : null;
});

function onSavePreset(): void {
  const name = newPresetName.value.trim();
  if (!name) return;
  audio.saveUserPreset(name);
  selection.value = `user:${name}`;
  newPresetName.value = "";
}

function onDeletePreset(): void {
  const name = selectedUserPreset.value;
  if (!name) return;
  audio.deleteUserPreset(name);
  selection.value = "Flat";
}

const limiter = computed<boolean>({
  get: () => audio.limiterEnabled,
  set: (v) => void audio.setLimiter(v),
});

const crossfeed = computed<boolean>({
  get: () => audio.crossfeedEnabled,
  set: (v) => void audio.setCrossfeed(v),
});

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 ? 1 : 0)}k` : `${hz}`;
}
</script>

<style scoped>
.eq-band {
  min-width: 0;
}
</style>
