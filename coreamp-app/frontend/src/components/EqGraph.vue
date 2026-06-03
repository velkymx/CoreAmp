<template>
  <svg
    :viewBox="`0 0 ${W} ${H}`"
    class="eq-graph w-100 rounded"
    preserveAspectRatio="none"
    data-test="eq-graph"
  >
    <line x1="0" :y1="zeroY" :x2="W" :y2="zeroY" class="eq-zero" />
    <polyline :points="points" class="eq-curve" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { EqBand } from "@/types";
import { eqCurveDb, eqFrequencyAxis } from "@/util/eq";

const props = defineProps<{ bands: EqBand[] }>();

const W = 320;
const H = 120;
const RANGE_DB = 24;
const zeroY = H / 2;

const freqs = eqFrequencyAxis(96);

const points = computed(() => {
  const curve = eqCurveDb(props.bands, freqs);
  return curve
    .map((db, i) => {
      const x = (i / (curve.length - 1)) * W;
      const clamped = Math.min(Math.max(db, -RANGE_DB), RANGE_DB);
      const y = zeroY - (clamped / RANGE_DB) * (H / 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
});
</script>

<style scoped>
.eq-graph {
  height: 120px;
  background: var(--bs-tertiary-bg, rgba(127, 127, 127, 0.12));
}
.eq-zero {
  stroke: var(--bs-border-color, rgba(127, 127, 127, 0.4));
  stroke-width: 1;
  stroke-dasharray: 4 4;
}
.eq-curve {
  fill: none;
  stroke: var(--bs-primary, #0d6efd);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}
</style>
