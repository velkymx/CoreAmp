<template>
  <div ref="hostEl" class="kh-game" data-test="keyboard-hero">
    <!-- Full-frame flash on big hits / milestones. -->
    <div class="kh-flash" :style="{ opacity: flash * 0.5 }" aria-hidden="true"></div>

    <!-- HUD -->
    <div class="kh-hud">
      <span class="kh-score" data-test="kh-score">{{ score.toLocaleString() }}</span>
      <div class="kh-streak">
        <span v-if="multiplier > 1" class="kh-mult" :class="`m${multiplier}`" data-test="kh-mult">
          ×{{ multiplier }}
        </span>
        <span v-if="multiplier >= 4" class="kh-fever" data-test="kh-fever">FEVER</span>
        <span v-if="combo > 1" class="kh-combo" data-test="kh-combo">{{ combo }} combo</span>
      </div>
      <span v-if="message" class="kh-message" data-test="kh-message">{{ message }}</span>
    </div>

    <!-- Lane labels (always visible) -->
    <div class="kh-lanes" aria-hidden="true">
      <span
        v-for="(key, i) in LANE_KEYS"
        :key="i"
        class="kh-lane-label"
        :style="{ color: laneCss(i) }"
        >{{ key.toUpperCase() }}</span
      >
    </div>

    <!-- End-of-song results -->
    <div v-if="finished" class="kh-results" data-test="kh-results">
      <h2 class="h4 mb-3">Song complete</h2>
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
import { useUiStore } from "@/stores/ui";
import { errorMessage } from "@/stores/notify";
import {
  LANE_KEYS,
  LANE_COUNT,
  isOnset,
  buildSongChart,
  hashString,
  judge,
  scoreFor,
  nextCombo,
  comboMultiplier,
  comboMessage,
  accuracy,
  type Note,
  type Judgement,
} from "@/game/keyboardHero/engine";

defineEmits<{ (e: "close"): void }>();

// Neon per-lane colors (Guitar-Hero-ish).
const LANE_COLORS = [0x39ff14, 0xff2d55, 0xffe600, 0x2d7bff, 0xff8a00, 0xb14dff];
function laneCss(i: number): string {
  return `#${LANE_COLORS[i].toString(16).padStart(6, "0")}`;
}

const hostEl = ref<HTMLDivElement | null>(null);
const error = ref("");
const { freq } = useFrequencyData();
const player = usePlayerStore();
const ui = useUiStore();

const score = ref(0);
const combo = ref(0);
const multiplier = ref(1);
const maxCombo = ref(0);
const message = ref("");
const flash = ref(0);
const finished = ref(false);
const finalAccuracy = ref(0);

let perfect = 0;
let good = 0;
let miss = 0;
let everPlayed = false;

const TRAVEL = 1.6;
const SPAWN_Z = -36;
const HIT_Z = 5;
const HIT_WINDOW = 0.12;

let three: any = null;
let raf = 0;
let runningAvg = 0;
let spawnCounter = 0;
let lastSpawn = 0;
let messageTimer: ReturnType<typeof setTimeout> | undefined;

// Per-song chart: a deterministic, repeatable note stream for the whole track.
let chart: Note[] = [];
let chartIndex = 0;
let chartKey = "";

interface ActiveNote {
  lane: number;
  arrival: number;
  mesh: any;
  glow: any;
  trail: any;
  judged: boolean;
}
let notes: ActiveNote[] = [];
let laneFlash: number[] = new Array(LANE_COUNT).fill(0);

// Particle pool (additive points; fade to black = invisible).
const PARTICLE_MAX = 1200;
let pPos: Float32Array;
let pVel: Float32Array;
let pLife: Float32Array;
let pMax: Float32Array;
let pBase: Float32Array; // base rgb
let pGeo: any = null;
let pColorAttr: any = null;
let pCursor = 0;

function laneX(lane: number): number {
  return (lane - (LANE_COUNT - 1) / 2) * 2.6;
}

function setMessage(text: string): void {
  message.value = text;
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(() => (message.value = ""), 1100);
}

function nowSecs(): number {
  return performance.now() / 1000;
}

function resetState(): void {
  score.value = 0;
  combo.value = 0;
  multiplier.value = 1;
  maxCombo.value = 0;
  message.value = "";
  flash.value = 0;
  finished.value = false;
  perfect = good = miss = 0;
  everPlayed = false;
  runningAvg = 0;
  spawnCounter = 0;
  lastSpawn = 0;
  for (const n of notes) {
    n.mesh.parent?.remove(n.mesh);
    n.glow?.parent?.remove(n.glow);
    n.trail?.parent?.remove(n.trail);
  }
  notes = [];
}

function spawnBurst(x: number, y: number, z: number, color: number, count: number, speed: number): void {
  if (!pGeo) return;
  const r = ((color >> 16) & 255) / 255;
  const g = ((color >> 8) & 255) / 255;
  const b = (color & 255) / 255;
  for (let k = 0; k < count; k++) {
    const idx = pCursor % PARTICLE_MAX;
    pCursor++;
    const a = Math.random() * Math.PI * 2;
    const el = (Math.random() - 0.2) * Math.PI;
    const sp = speed * (0.4 + Math.random() * 0.8);
    pPos[idx * 3] = x;
    pPos[idx * 3 + 1] = y;
    pPos[idx * 3 + 2] = z;
    pVel[idx * 3] = Math.cos(a) * Math.cos(el) * sp;
    pVel[idx * 3 + 1] = Math.abs(Math.sin(el)) * sp + 2;
    pVel[idx * 3 + 2] = Math.sin(a) * Math.cos(el) * sp;
    pMax[idx] = 0.5 + Math.random() * 0.5;
    pLife[idx] = pMax[idx];
    pBase[idx * 3] = r;
    pBase[idx * 3 + 1] = g;
    pBase[idx * 3 + 2] = b;
  }
}

function init(THREE: any): void {
  const container = hostEl.value!;
  const w = container.clientWidth || 480;
  const h = container.clientHeight || 270;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x04060f, 1);
  renderer.autoClearColor = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x04060f, 16, 46);
  const camera = new THREE.PerspectiveCamera(64, w / h, 0.1, 140);
  camera.position.set(0, 8, 15);
  camera.lookAt(0, 0, -10);

  // Floor grid (neon, additive).
  const grid = new THREE.GridHelper(120, 60, 0x16306a, 0x0c1c44);
  grid.position.z = -14;
  (grid.material as any).transparent = true;
  (grid.material as any).opacity = 0.5;
  scene.add(grid);

  // Lane glow strips + dividers.
  const laneStrips: any[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: LANE_COLORS[i],
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.2, SPAWN_Z * -1 + HIT_Z + 4), mat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(laneX(i), -0.02, (SPAWN_Z + HIT_Z) / 2);
    scene.add(strip);
    laneStrips.push(strip);
  }

  // Per-lane hit-flash columns.
  const flashMeshes: any[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: LANE_COLORS[i],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 5), mat);
    mesh.position.set(laneX(i), 1.4, HIT_Z);
    scene.add(mesh);
    flashMeshes.push(mesh);
  }

  // Hit line glow bar.
  const hitBarMat = new THREE.MeshBasicMaterial({
    color: 0x9fd0ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const hitBar = new THREE.Mesh(
    new THREE.PlaneGeometry(laneX(LANE_COUNT - 1) - laneX(0) + 3, 0.5),
    hitBarMat,
  );
  hitBar.rotation.x = -Math.PI / 2;
  hitBar.position.set(0, 0.05, HIT_Z);
  scene.add(hitBar);

  // Particle system.
  pPos = new Float32Array(PARTICLE_MAX * 3);
  pVel = new Float32Array(PARTICLE_MAX * 3);
  pLife = new Float32Array(PARTICLE_MAX);
  pMax = new Float32Array(PARTICLE_MAX);
  pBase = new Float32Array(PARTICLE_MAX * 3);
  const pCol = new Float32Array(PARTICLE_MAX * 3);
  pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pColorAttr = new THREE.BufferAttribute(pCol, 3);
  pGeo.setAttribute("color", pColorAttr);
  const pMat = new THREE.PointsMaterial({
    size: 0.32,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  scene.add(new THREE.Points(pGeo, pMat));

  // Starfield backdrop.
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(300 * 3);
  for (let i = 0; i < 300; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 120;
    sPos[i * 3 + 1] = Math.random() * 40 + 4;
    sPos[i * 3 + 2] = -Math.random() * 80 - 10;
  }
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  scene.add(
    new THREE.Points(
      sGeo,
      new THREE.PointsMaterial({ color: 0x35508f, size: 0.25, transparent: true, opacity: 0.6 }),
    ),
  );

  // Reactive spectrum wall behind the highway (EQ bars, hue-cycling).
  const specBars: any[] = [];
  const SPEC_N = 28;
  for (let i = 0; i < SPEC_N; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1), mat);
    bar.position.set((i - SPEC_N / 2) * 1.5, 6, -52);
    scene.add(bar);
    specBars.push(bar);
  }

  // Shockwave ring pool (expanding additive rings on perfect hits).
  const rings: any[] = [];
  for (let i = 0; i < 10; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 32), mat);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    scene.add(ring);
    rings.push({ mesh: ring, life: 0 });
  }

  // ── EDC main-stage rig ────────────────────────────────────────────────────
  // Sweeping spotlight beams (cones whose apex sits at a high pivot so they
  // sweep like searchlights).
  const spotlights: any[] = [];
  const SPOT_N = 6;
  for (let i = 0; i < SPOT_N; i++) {
    const geo = new THREE.ConeGeometry(4.5, 80, 20, 1, true);
    geo.translate(0, -40, 0); // apex at the origin → rotates from the top
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.set((i - (SPOT_N - 1) / 2) * 7, 30, -34);
    scene.add(beam);
    spotlights.push({ mesh: beam, phase: i * 1.15, hue: i / SPOT_N });
  }

  // Laser fan from a single rig point.
  const lasers: any[] = [];
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.LineBasicMaterial({
      color: 0x39ff14,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 24, -40),
      new THREE.Vector3((i - 3) * 9, 0, -8),
    ]);
    const line = new THREE.Line(g, mat);
    scene.add(line);
    lasers.push({ mesh: line });
  }

  // Lightning bolt (jagged line, flashed on big hits).
  const ltMat = new THREE.LineBasicMaterial({
    color: 0xcfe6ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
  });
  const ltGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 30, -38),
    new THREE.Vector3(0, -2, -38),
  ]);
  const lightning = new THREE.Line(ltGeo, ltMat);
  lightning.visible = false;
  scene.add(lightning);

  three = {
    THREE,
    scene,
    camera,
    renderer,
    flashMeshes,
    laneStrips,
    hitBar,
    hitBarMat,
    specBars,
    rings,
    spotlights,
    lasers,
    lightning,
    ltLife: 0,
    ltCooldown: 0,
    ringCursor: 0,
    camBaseY: 8,
    punch: 0,
  };
}

function strikeLightning(): void {
  if (!three) return;
  const { THREE, lightning } = three;
  const pts = [];
  let x = (Math.random() - 0.5) * 30;
  for (let y = 30; y >= -2; y -= 4) {
    x += (Math.random() - 0.5) * 6;
    pts.push(new THREE.Vector3(x, y, -38));
  }
  lightning.geometry.setFromPoints(pts);
  lightning.visible = true;
  lightning.material.opacity = 1;
  three.ltLife = 1;
}

function spawnRing(x: number, z: number, color: number): void {
  if (!three) return;
  const r = three.rings[three.ringCursor % three.rings.length];
  three.ringCursor++;
  r.mesh.position.set(x, 0.06, z);
  r.mesh.material.color.setHex(color);
  r.mesh.material.opacity = 0.9;
  r.mesh.scale.setScalar(0.5);
  r.mesh.visible = true;
  r.life = 1;
}

function spawnNote(lane: number): void {
  if (!three) return;
  const { THREE, scene } = three;
  const color = LANE_COLORS[lane];
  const mat = new THREE.MeshBasicMaterial({
    color,
    blending: THREE.AdditiveBlending,
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.1), mat);
  mesh.position.set(laneX(lane), 0.35, SPAWN_Z);
  scene.add(mesh);
  // Trailing glow.
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.35,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), glowMat);
  glow.position.copy(mesh.position);
  glow.rotation.x = -Math.PI / 2;
  scene.add(glow);
  // Vertical comet trail behind the note.
  const trailMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 6), trailMat);
  trail.position.set(laneX(lane), 0.3, SPAWN_Z - 3);
  scene.add(trail);
  notes.push({ lane, arrival: nowSecs() + TRAVEL, mesh, glow, trail, judged: false });
}

function registerJudgement(j: Judgement, lane: number): void {
  const mult = comboMultiplier(combo.value);
  if (j === "perfect") perfect++;
  else if (j === "good") good++;
  else miss++;
  score.value += scoreFor(j) * mult;
  combo.value = nextCombo(combo.value, j);
  multiplier.value = comboMultiplier(combo.value);
  if (combo.value > maxCombo.value) maxCombo.value = combo.value;

  const m = comboMessage(combo.value);
  if (m) {
    setMessage(m);
    flash.value = 1;
    if (three) three.punch = 1; // camera kick on milestone
  } else if (j === "miss") {
    setMessage("Miss");
  }

  if (j !== "miss" && three) {
    const big = j === "perfect";
    const fever = multiplier.value >= 4;
    const color = fever ? 0xffd700 : LANE_COLORS[lane];
    spawnBurst(
      laneX(lane),
      0.5,
      HIT_Z,
      color,
      (big ? 60 : 28) * (fever ? 1.8 : 1),
      (big ? 11 : 7) * (fever ? 1.3 : 1),
    );
    laneFlash[lane] = big ? 1.5 : 1;
    if (big) spawnRing(laneX(lane), HIT_Z, color);
  }
}

function onKey(e: KeyboardEvent): void {
  if (finished.value) return;
  const lane = LANE_KEYS.indexOf(e.key.toLowerCase() as never);
  if (lane < 0) return;
  e.preventDefault();
  laneFlash[lane] = Math.max(laneFlash[lane], 0.6);
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
  if (best && bestDelta <= HIT_WINDOW) {
    best.judged = true;
    registerJudgement(judge(best.arrival - t), lane);
    best.mesh.parent?.remove(best.mesh);
    best.glow?.parent?.remove(best.glow);
    best.trail?.parent?.remove(best.trail);
    notes = notes.filter((n) => n !== best);
  }
}

function tick(): void {
  raf = requestAnimationFrame(tick);
  if (!three) return;
  const {
    THREE,
    renderer,
    scene,
    camera,
    flashMeshes,
    laneStrips,
    hitBarMat,
    specBars,
    rings,
    spotlights,
    lasers,
    camBaseY,
  } = three;
  const t = nowSecs();
  const bands = extractBands(freq.value);
  const energy = bands.bass * 0.7 + bands.mid * 0.3;
  const fever = multiplier.value >= 4;

  if (player.isPlaying) everPlayed = true;

  // Build the deterministic per-song chart once the track + duration are known
  // (or when the track changes) so the same song always plays the same level.
  const track = player.currentTrack;
  const dur = player.durationSecs;
  const key = track ? track.path : "";
  if (track && dur && dur > 0 && chartKey !== key) {
    chart = buildSongChart(hashString(key), dur);
    chartKey = key;
    chartIndex = 0;
    while (chartIndex < chart.length && chart[chartIndex].time < player.positionSecs) chartIndex++;
  }

  // Steady stream: spawn chart notes as the song position reaches their lead
  // time. Position-driven (not RAF-driven), so it stays in sync and a miss
  // never interrupts the flow.
  const songT = player.positionSecs;
  while (chartIndex < chart.length && songT >= chart[chartIndex].time - TRAVEL) {
    if (chart[chartIndex].time - songT > -0.3) spawnNote(chart[chartIndex].lane);
    chartIndex++;
  }

  // Live onsets only drive eye-candy now (sky confetti pops + lightning).
  runningAvg = runningAvg * 0.92 + energy * 0.08;
  if (player.isPlaying && isOnset(energy, runningAvg) && t - lastSpawn > 0.12) {
    spawnCounter++;
    const popColor = LANE_COLORS[spawnCounter % LANE_COLORS.length];
    spawnBurst((Math.random() - 0.5) * 36, 20 + Math.random() * 8, -34, popColor, 24, 9);
    lastSpawn = t;
  }

  // Reactive spectrum wall.
  const data = freq.value;
  for (let i = 0; i < specBars.length; i++) {
    const v = data && data.length ? data[(i * 7) % data.length] / 255 : 0;
    const bar = specBars[i];
    bar.scale.y = 0.5 + v * 16;
    bar.position.y = 1 + (bar.scale.y * 1) / 2;
    const hue = ((i / specBars.length) * 300 + t * 30 + (fever ? 0 : 0)) % 360;
    bar.material.color.setHSL((fever ? 45 : hue) / 360, 1, 0.5);
    bar.material.opacity = 0.18 + v * 0.4;
  }

  // Shockwave rings expand + fade.
  for (const r of rings) {
    if (r.life <= 0) {
      r.mesh.visible = false;
      continue;
    }
    r.life -= 0.045;
    r.mesh.scale.setScalar(0.5 + (1 - r.life) * 6);
    r.mesh.material.opacity = Math.max(0, r.life) * 0.8;
  }

  // Camera punch on milestones (decays; no longer moves the camera).
  three.punch = Math.max(0, three.punch - 0.06);

  // ── EDC rig animation ─────────────────────────────────────────────────────
  // Sweeping, color-cycling spotlight beams.
  for (let i = 0; i < spotlights.length; i++) {
    const s = spotlights[i];
    s.mesh.rotation.z = Math.sin(t * 0.7 + s.phase) * 0.85;
    s.mesh.rotation.x = -0.22 + Math.cos(t * 0.43 + s.phase) * 0.2;
    const hue = (s.hue + t * 0.05) % 1;
    s.mesh.material.color.setHSL(fever ? 0.12 : hue, 1, 0.55);
    s.mesh.material.opacity = 0.05 + bands.mid * 0.2 + bands.treble * 0.12;
  }
  // Laser fan flicker (treble-driven), hue cycling.
  for (let i = 0; i < lasers.length; i++) {
    const m = lasers[i].mesh.material;
    m.opacity = 0.04 + bands.treble * 0.6;
    m.color.setHSL((0.33 + t * 0.06 + i * 0.04) % 1, 1, 0.55);
  }
  // Lightning strikes on hard bass (rate-limited) + its flash.
  three.ltCooldown -= 1 / 60;
  if (bands.bass > 0.5 && three.ltCooldown <= 0 && Math.random() < 0.35) {
    strikeLightning();
    three.ltCooldown = 0.5;
  }
  if (three.ltLife > 0) {
    three.ltLife -= 0.14;
    three.lightning.material.opacity = Math.max(0, three.ltLife);
    if (three.ltLife <= 0) three.lightning.visible = false;
    flash.value = Math.max(flash.value, three.ltLife * 0.55);
  }

  // Advance notes; a missed (un-pressed) note just resets the combo — the game
  // keeps going until the song ends.
  for (const n of notes) {
    const progress = 1 - (n.arrival - t) / TRAVEL;
    const z = SPAWN_Z + progress * (HIT_Z - SPAWN_Z);
    n.mesh.position.z = z;
    n.mesh.rotation.x += fever ? 0.12 : 0.06;
    n.mesh.scale.setScalar(1 + bands.bass * 0.25);
    if (n.glow) n.glow.position.z = z;
    if (n.trail) n.trail.position.z = z - 3;
    if (!n.judged && t - n.arrival > HIT_WINDOW) {
      n.judged = true;
      registerJudgement("miss", n.lane);
    }
  }
  notes = notes.filter((n) => {
    if (n.judged && t - n.arrival > 0.2) {
      n.mesh.parent?.remove(n.mesh);
      n.glow?.parent?.remove(n.glow);
      n.trail?.parent?.remove(n.trail);
      return false;
    }
    return true;
  });

  // Particles.
  const dt = 1 / 60;
  const col = pColorAttr.array as Float32Array;
  for (let i = 0; i < PARTICLE_MAX; i++) {
    if (pLife[i] <= 0) {
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
      continue;
    }
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= 14 * dt; // gravity
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    const f = Math.max(0, pLife[i] / pMax[i]);
    col[i * 3] = pBase[i * 3] * f;
    col[i * 3 + 1] = pBase[i * 3 + 1] * f;
    col[i * 3 + 2] = pBase[i * 3 + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true;
  pColorAttr.needsUpdate = true;

  // Lane flashes + beat-reactive strips.
  for (let i = 0; i < LANE_COUNT; i++) {
    laneFlash[i] = Math.max(0, laneFlash[i] - 0.07);
    flashMeshes[i].material.opacity = laneFlash[i] * 0.7;
    laneStrips[i].material.opacity = 0.05 + bands.bass * 0.12 + laneFlash[i] * 0.1;
  }
  hitBarMat.opacity = 0.6 + bands.bass * 0.4;

  // Camera stays locked (no bob/shake/punch) — the highway never jitters.
  void camBaseY;
  flash.value = Math.max(0, flash.value - 0.05);
  // Fever tints the whole scene hot gold; otherwise a subtle bass glow.
  renderer.setClearColor(
    fever
      ? new THREE.Color(0x1a1206).offsetHSL(0, 0, bands.bass * 0.12)
      : new THREE.Color(0x04060f).offsetHSL(0, 0, bands.bass * 0.05),
    1,
  );

  // End only when the song actually ends (never on a miss or a pause).
  if (!finished.value && everPlayed) {
    const dur = player.durationSecs;
    if (dur != null && dur > 0 && player.positionSecs >= dur - 0.25) {
      finalAccuracy.value = accuracy(perfect, good, miss);
      finished.value = true;
    }
  }

  renderer.render(scene, camera);
}

function restart(): void {
  resetState();
  chartIndex = 0;
  // Replay the same level from the top of the song.
  void player.seek(0);
  if (!player.isPlaying) void player.togglePlayback();
}

onMounted(async () => {
  ui.setInteractiveVisualizer(true);
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
  ui.setInteractiveVisualizer(false);
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
  background: #04060f;
  overflow: hidden;
}
.kh-flash {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.6), rgba(120, 180, 255, 0.2) 60%, transparent 75%);
  pointer-events: none;
  transition: opacity 0.1s ease;
}
.kh-hud {
  position: absolute;
  top: 0.5rem;
  left: 0.85rem;
  z-index: 6;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}
.kh-score {
  font-size: 1.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.kh-streak {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.kh-mult {
  font-weight: 900;
  font-size: 1.2rem;
  padding: 0 0.35rem;
  border-radius: 0.25rem;
}
.kh-mult.m2 {
  color: #39ff14;
}
.kh-mult.m3 {
  color: #ffe600;
}
.kh-mult.m4 {
  color: #ff2d55;
  text-shadow: 0 0 10px #ff2d55;
}
.kh-fever {
  font-weight: 900;
  color: #ffd700;
  letter-spacing: 0.15em;
  text-shadow: 0 0 14px #ffae00, 0 0 28px #ff7b00;
  animation: kh-fever-pulse 0.4s ease-in-out infinite alternate;
}
@keyframes kh-fever-pulse {
  from {
    transform: scale(1);
    opacity: 0.85;
  }
  to {
    transform: scale(1.18);
    opacity: 1;
  }
}
.kh-combo {
  color: #8fd0ff;
  font-weight: 600;
}
.kh-message {
  color: #ffd86e;
  font-weight: 800;
  font-size: 1.1rem;
  text-shadow: 0 0 12px rgba(255, 216, 110, 0.6);
}
.kh-lanes {
  position: absolute;
  bottom: 0.4rem;
  left: 0;
  right: 0;
  z-index: 6;
  display: flex;
  justify-content: center;
  gap: 2.4rem;
  pointer-events: none;
}
.kh-lane-label {
  font-weight: 800;
  font-size: 1rem;
  text-shadow: 0 0 8px currentColor, 0 1px 3px rgba(0, 0, 0, 0.9);
}
.kh-results {
  position: absolute;
  inset: 0;
  z-index: 7;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(4, 6, 15, 0.88);
  color: #fff;
  text-align: center;
}
.kh-result-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.3rem 1.6rem;
  margin: 0;
  font-size: 1.1rem;
}
.kh-result-grid dt {
  color: #9fb3d8;
  text-align: right;
}
.kh-result-grid dd {
  margin: 0;
  font-weight: 800;
}
.kh-btn {
  border: 1px solid var(--bs-border-color, rgba(127, 127, 127, 0.4));
  background: transparent;
  color: #fff;
  border-radius: 0.3rem;
  padding: 0.35rem 1rem;
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
  z-index: 6;
}
</style>
