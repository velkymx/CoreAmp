<template>
  <div ref="hostEl" class="kh-game" data-test="keyboard-hero">
    <!-- HUD -->
    <div class="kh-hud">
      <span class="kh-score" data-test="kh-score">{{ score.toLocaleString() }}</span>
      <span v-if="combo > 1" class="kh-combo" data-test="kh-combo">{{ combo }} combo</span>
      <span v-if="message" class="kh-message" data-test="kh-message">{{ message }}</span>
    </div>

    <!-- Lane labels (always visible) -->
    <div class="kh-lanes" aria-hidden="true">
      <span v-for="(key, i) in LANE_KEYS" :key="i" class="kh-lane-label">{{ key.toUpperCase() }}</span>
    </div>

    <!-- End-of-song results -->
    <div v-if="finished" class="kh-results" data-test="kh-results">
      <h2 class="h5 mb-3">Song complete</h2>
      <dl class="kh-result-grid">
        <dt>Score</dt><dd>{{ score.toLocaleString() }}</dd>
        <dt>Accuracy</dt><dd>{{ finalAccuracy }}%</dd>
        <dt>Longest combo</dt><dd>{{ maxCombo }}</dd>
      </dl>
      <div class="d-flex gap-2 justify-content-center mt-3">
        <button class="kh-btn" data-test="kh-close" @click="$emit('close')">Close</button>
        <button class="kh-btn primary" data-test="kh-again" @click="restart">Play again</button>
      </div>
    </div>

    <div v-if="error" class="kh-error small text-light">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { loadThree } from "@/visualizer/loadVendor";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { extractBands } from "@/visualizer/bands";
import { usePlayerStore } from "@/stores/player";
import { errorMessage } from "@/stores/notify";
import {
  LANE_KEYS,
  LANE_COUNT,
  isOnset,
  laneForSpawn,
  judge,
  scoreFor,
  nextCombo,
  comboMessage,
  accuracy,
  type Judgement,
} from "@/game/keyboardHero/engine";

defineEmits<{ (e: "close"): void }>();

const hostEl = ref<HTMLDivElement | null>(null);
const error = ref("");
const { freq } = useFrequencyData();
const player = usePlayerStore();

// Reactive HUD state.
const score = ref(0);
const combo = ref(0);
const maxCombo = ref(0);
const message = ref("");
const finished = ref(false);
const finalAccuracy = ref(0);

// Counts for accuracy.
let perfect = 0;
let good = 0;
let miss = 0;

// Note travel time (spawn → hit line) in seconds.
const TRAVEL = 1.6;
const SPAWN_Z = -34;
const HIT_Z = 4;

let three: any = null;
let raf = 0;
let runningAvg = 0;
let spawnCounter = 0;
let lastSpawn = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;

interface ActiveNote {
  lane: number;
  arrival: number; // performance.now()/1000 when it reaches the hit line
  mesh: any;
  judged: boolean;
}
let notes: ActiveNote[] = [];
let laneFlash: number[] = new Array(LANE_COUNT).fill(0);

function laneX(lane: number): number {
  const spread = 9;
  return (lane - (LANE_COUNT - 1) / 2) * (spread / LANE_COUNT) * 1.6;
}

function setMessage(text: string): void {
  message.value = text;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (message.value = ""), 1200);
}

function resetState(): void {
  score.value = 0;
  combo.value = 0;
  maxCombo.value = 0;
  message.value = "";
  finished.value = false;
  perfect = good = miss = 0;
  runningAvg = 0;
  spawnCounter = 0;
  lastSpawn = 0;
  for (const n of notes) n.mesh.parent?.remove(n.mesh);
  notes = [];
}

function init(THREE: any): void {
  const container = hostEl.value!;
  const w = container.clientWidth || 480;
  const h = container.clientHeight || 270;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x05060d, 1);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060d, 18, 40);
  const camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 120);
  camera.position.set(0, 7.5, 14);
  camera.lookAt(0, 0, -10);

  // Lane dividers + hit line.
  const laneMat = new THREE.LineBasicMaterial({ color: 0x2a3a66 });
  for (let i = 0; i <= LANE_COUNT; i++) {
    const x = laneX(i) - (laneX(1) - laneX(0)) / 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0, SPAWN_Z),
      new THREE.Vector3(x, 0, HIT_Z + 2),
    ]);
    scene.add(new THREE.Line(geo, laneMat));
  }
  const hitGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(laneX(0) - 1, 0.02, HIT_Z),
    new THREE.Vector3(laneX(LANE_COUNT - 1) + 1, 0.02, HIT_Z),
  ]);
  const hitLine = new THREE.Line(hitGeo, new THREE.LineBasicMaterial({ color: 0x6ea8fe }));
  scene.add(hitLine);

  // Per-lane flash quads at the hit line.
  const flashMeshes: any[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x6ea8fe,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(laneX(i), 0.01, HIT_Z - 1);
    scene.add(mesh);
    flashMeshes.push(mesh);
  }

  three = { THREE, scene, camera, renderer, flashMeshes, hitLine };
}

function spawnNote(lane: number): void {
  if (!three) return;
  const { THREE, scene } = three;
  const mat = new THREE.MeshBasicMaterial({ color: 0x8fd0ff });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.0), mat);
  mesh.position.set(laneX(lane), 0.3, SPAWN_Z);
  scene.add(mesh);
  notes.push({ lane, arrival: nowSecs() + TRAVEL, mesh, judged: false });
}

function nowSecs(): number {
  return performance.now() / 1000;
}

function registerJudgement(j: Judgement): void {
  if (j === "perfect") perfect++;
  else if (j === "good") good++;
  else miss++;
  score.value += scoreFor(j);
  combo.value = nextCombo(combo.value, j);
  if (combo.value > maxCombo.value) maxCombo.value = combo.value;
  const m = comboMessage(combo.value);
  if (m) setMessage(m);
  if (j === "miss") setMessage("Miss");
}

function onKey(e: KeyboardEvent): void {
  if (finished.value) return;
  const lane = LANE_KEYS.indexOf(e.key.toLowerCase() as never);
  if (lane < 0) return;
  e.preventDefault();
  laneFlash[lane] = 1;
  // Nearest un-judged note in this lane.
  let best: ActiveNote | null = null;
  let bestDelta = Infinity;
  const t = nowSecs();
  for (const n of notes) {
    if (n.judged || n.lane !== lane) continue;
    const delta = Math.abs(n.arrival - t);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = n;
    }
  }
  if (best && bestDelta <= 0.12) {
    best.judged = true;
    registerJudgement(judge(best.arrival - t));
    best.mesh.parent?.remove(best.mesh);
    notes = notes.filter((n) => n !== best);
  }
}

function tick(): void {
  raf = requestAnimationFrame(tick);
  if (!three) return;
  const { renderer, scene, camera, flashMeshes } = three;
  const t = nowSecs();
  const bands = extractBands(freq.value);
  const energy = bands.bass * 0.7 + bands.mid * 0.3;

  // Onset → spawn (rate-limited so notes never stack on one frame).
  runningAvg = runningAvg * 0.92 + energy * 0.08;
  if (player.isPlaying && isOnset(energy, runningAvg) && t - lastSpawn > 0.18) {
    spawnCounter++;
    const bandIndex = bands.treble > bands.bass ? 2 : bands.mid > bands.bass ? 1 : 0;
    spawnNote(laneForSpawn(bandIndex, spawnCounter));
    lastSpawn = t;
  }

  // Advance notes; miss any that pass the hit line + window.
  for (const n of notes) {
    const progress = 1 - (n.arrival - t) / TRAVEL; // 0 spawn .. 1 hit line
    n.mesh.position.z = SPAWN_Z + progress * (HIT_Z - SPAWN_Z);
    if (!n.judged && t - n.arrival > 0.12) {
      n.judged = true;
      registerJudgement("miss");
    }
  }
  notes = notes.filter((n) => {
    if (n.judged && t - n.arrival > 0.2) {
      n.mesh.parent?.remove(n.mesh);
      return false;
    }
    return true;
  });

  // Lane flashes decay.
  for (let i = 0; i < LANE_COUNT; i++) {
    laneFlash[i] = Math.max(0, laneFlash[i] - 0.08);
    flashMeshes[i].material.opacity = laneFlash[i] * 0.6;
  }

  // Reactive background pulse + end detection.
  renderer.setClearColor(
    new three.THREE.Color(0x05060d).offsetHSL(0, 0, bands.bass * 0.06),
    1,
  );
  if (!finished.value && !player.isPlaying && (perfect + good + miss) > 0) {
    finalAccuracy.value = accuracy(perfect, good, miss);
    finished.value = true;
  }

  renderer.render(scene, camera);
}

function restart(): void {
  resetState();
}

onMounted(async () => {
  try {
    const THREE = await loadThree();
    if (!THREE) throw new Error("three.js global not found");
    init(THREE);
    window.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(tick);
  } catch (err) {
    error.value = `Keyboard Hero unavailable: ${errorMessage(err)}`;
  }
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  if (messageTimer) clearTimeout(messageTimer);
  window.removeEventListener("keydown", onKey);
  if (three) {
    try {
      three.renderer.dispose();
      three.renderer.domElement.parentNode?.removeChild(three.renderer.domElement);
    } catch {
      /* ignore */
    }
    three = null;
  }
});
</script>

<style scoped>
.kh-game {
  position: absolute;
  inset: 0;
  background: #05060d;
  overflow: hidden;
}
.kh-hud {
  position: absolute;
  top: 0.5rem;
  left: 0.75rem;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
}
.kh-score {
  font-size: 1.4rem;
  font-weight: 700;
}
.kh-combo {
  color: #8fd0ff;
  font-weight: 600;
}
.kh-message {
  color: #ffd86e;
  font-weight: 700;
}
.kh-lanes {
  position: absolute;
  bottom: 0.4rem;
  left: 0;
  right: 0;
  z-index: 4;
  display: flex;
  justify-content: center;
  gap: 2.2rem;
  pointer-events: none;
}
.kh-lane-label {
  color: #6ea8fe;
  font-weight: 700;
  font-size: 0.9rem;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
.kh-results {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(5, 6, 13, 0.85);
  color: #fff;
  text-align: center;
}
.kh-result-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.25rem 1.5rem;
  margin: 0;
}
.kh-result-grid dt {
  color: #9fb3d8;
  text-align: right;
}
.kh-result-grid dd {
  margin: 0;
  font-weight: 700;
}
.kh-btn {
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.4));
  background: transparent;
  color: #fff;
  border-radius: 0.3rem;
  padding: 0.3rem 0.9rem;
  cursor: pointer;
}
.kh-btn.primary {
  background: var(--bs-primary, #0d6efd);
  border-color: var(--bs-primary, #0d6efd);
}
.kh-error {
  position: absolute;
  left: 0.75rem;
  bottom: 2.5rem;
  z-index: 5;
}
</style>
