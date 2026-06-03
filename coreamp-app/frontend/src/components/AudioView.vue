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
    </div>

    <EqGraph :bands="audio.bands" />

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
import { computed } from "vue";
import type { FormSelectOption, FormSelectOptionValue } from "@velkymx/vibeui";
import EqGraph from "@/components/EqGraph.vue";
import { useAudioStore, type EqPresetName } from "@/stores/audio";

const audio = useAudioStore();

const PRESETS: EqPresetName[] = ["Flat", "Warm", "Presence", "V Curve", "Bass Cut"];
const presetOptions: FormSelectOption[] = PRESETS.map((p) => ({ value: p, text: p }));

const eqEnabled = computed<boolean>({
  get: () => audio.eqEnabled,
  set: (v) => void audio.setEqEnabled(v),
});

const presetModel = computed<FormSelectOptionValue>({
  get: () => audio.preset,
  set: (v) => void audio.applyPreset(String(v) as EqPresetName),
});

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
