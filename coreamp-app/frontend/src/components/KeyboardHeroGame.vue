<template>
  <div ref="hostEl" class="kh-game" data-test="keyboard-hero">
    <!-- Full-frame flash on big hits / milestones. -->
    <div class="kh-flash" :style="{ opacity: flash * 0.5 }" aria-hidden="true"></div>

    <!-- Cinematic overlays: subtle film grain + edge vignette for depth/polish. -->
    <div class="kh-grain" aria-hidden="true"></div>
    <div class="kh-vignette" aria-hidden="true"></div>

    <!-- Song progress bar + now-playing label. -->
    <div class="kh-progress" aria-hidden="true">
      <div class="kh-progress-fill" :style="{ width: progressPct + '%' }"></div>
    </div>
    <div v-if="nowPlaying" class="kh-nowplaying" data-test="kh-nowplaying">{{ nowPlaying }}</div>

    <!-- HUD -->
    <div class="kh-hud">
      <span class="kh-score" data-test="kh-score">{{ score.toLocaleString() }}</span>
      <div class="kh-streak">
        <span v-if="multiplier > 1" class="kh-mult" :class="`m${multiplier}`" data-test="kh-mult">
          ×{{ multiplier }}
        </span>
        <span v-if="multiplier >= 4" class="kh-fever" data-test="kh-fever">FEVER</span>
        <span v-if="combo > 1" :key="combo" class="kh-combo" data-test="kh-combo">{{ combo }} combo</span>
      </div>
      <span v-if="message" :key="message" class="kh-message" data-test="kh-message">{{ message }}</span>
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
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
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
// Warm, cohesive "golden-hour" palette — amber, coral, sunlit yellow, peach,
// gold, soft lavender. Still six readable lanes, but the whole set leans warm so
// the scene feels like a sunset hangout rather than a cold club.
const LANE_COLORS = [0xffb347, 0xff6f91, 0xffe066, 0xff9e7d, 0xffd27f, 0xc9a0ff];
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

// Song-position progress (0–100) + a subtle now-playing label for the HUD.
const progressPct = computed(() => {
  const d = player.durationSecs;
  if (!d || d <= 0) return 0;
  return Math.max(0, Math.min(100, (player.positionSecs / d) * 100));
});
const nowPlaying = computed(() => {
  const tr = player.currentTrack;
  if (!tr) return "";
  const title = tr.title || tr.path.split("/").pop() || "";
  return tr.artist ? `${tr.artist} — ${title}` : title;
});

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
// Tempo tracking: smoothed seconds between detected beats → drives disco-ball RPM.
let beatInterval = 0.5; // ~120 BPM until we measure
let lastBeatT = 0;
let discoSpin = 0; // smoothed angular velocity (rad/frame)
// Smoothed visual song clock: advanced by real frame time every frame and
// gently re-synced to player.positionSecs (which only ticks a few times/sec).
// Drives note motion so they slide buttery-smooth instead of stepping.
let smoothSongT = 0;
let lastFrameMs = 0;
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
  refl: any; // mirrored copy under the glossy floor
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
let bokehVel: Float32Array; // per-mote rise speed for the warm drifting bokeh

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

// Free a mesh's GPU resources (geometry + material) and detach it. WebGL
// objects aren't garbage-collected, so notes must be disposed, not just removed.
function disposeMesh(m: any): void {
  if (!m) return;
  m.parent?.remove(m);
  m.geometry?.dispose?.();
  const mat = m.material;
  if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x: any) => x?.dispose?.());
}
function disposeNote(n: ActiveNote): void {
  disposeMesh(n.mesh);
  disposeMesh(n.glow);
  disposeMesh(n.trail);
  disposeMesh(n.refl);
}

// Build a gemstone "pad" texture for a lane colour: rounded rect, vertical
// gradient fill (light → colour → dark) with a top shine and a bright gradient
// border. Drawn once per lane and reused by every note in that lane.
function makePadTexture(THREE: any, hex: number): any {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const x = c.getContext("2d");
  const base = new THREE.Color(hex);
  const light = base.clone().lerp(new THREE.Color(0xffffff), 0.6);
  const rim = base.clone().lerp(new THREE.Color(0xffffff), 0.3);
  const dark = base.clone().multiplyScalar(0.32);
  const css = (cc: any) =>
    `rgb(${Math.round(cc.r * 255)},${Math.round(cc.g * 255)},${Math.round(cc.b * 255)})`;
  const W = 256;
  const H = 128;
  const pad = 12;
  const r = 30;
  const rr = () => {
    const x0 = pad;
    const y0 = pad;
    const x1 = W - pad;
    const y1 = H - pad;
    if (!x) return;
    x.beginPath();
    x.moveTo(x0 + r, y0);
    x.lineTo(x1 - r, y0);
    x.arcTo(x1, y0, x1, y0 + r, r);
    x.lineTo(x1, y1 - r);
    x.arcTo(x1, y1, x1 - r, y1, r);
    x.lineTo(x0 + r, y1);
    x.arcTo(x0, y1, x0, y1 - r, r);
    x.lineTo(x0, y0 + r);
    x.arcTo(x0, y0, x0 + r, y0, r);
    x.closePath();
  };
  if (x) {
    const g = x.createLinearGradient(0, pad, 0, H - pad);
    g.addColorStop(0, css(light));
    g.addColorStop(0.5, css(base));
    g.addColorStop(1, css(dark));
    rr();
    x.fillStyle = g;
    x.fill();
    // Top shine (gemstone highlight).
    const sh = x.createLinearGradient(0, pad, 0, H * 0.55);
    sh.addColorStop(0, "rgba(255,255,255,0.55)");
    sh.addColorStop(1, "rgba(255,255,255,0)");
    rr();
    x.fillStyle = sh;
    x.fill();
    // Bright gradient border.
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, css(light));
    bg.addColorStop(1, css(rim));
    rr();
    x.lineWidth = 7;
    x.strokeStyle = bg;
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  if ("colorSpace" in tex) (tex as any).colorSpace = THREE.SRGBColorSpace;
  return tex;
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
  smoothSongT = player.positionSecs;
  lastFrameMs = 0;
  for (const n of notes) disposeNote(n);
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
  renderer.setClearColor(0x1c0f1a, 1); // deep warm dusk, not cold black
  renderer.autoClearColor = true;
  // Filmic roll-off: the additive neon glows now bloom toward warm white instead
  // of clipping to a flat blown-out white — the single biggest "polish" lever.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x2a1622, 18, 52); // warm haze that softens the distance

  // Painted dusk-gradient sky (deep plum aloft → warm peach at the horizon) as
  // the scene background — a real graded backdrop reads far richer than a flat
  // clear color.
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 4;
  skyCanvas.height = 256;
  const skctx = skyCanvas.getContext("2d");
  if (skctx) {
    const sg = skctx.createLinearGradient(0, 0, 0, 256);
    sg.addColorStop(0.0, "#150a16"); // top, deep plum night
    sg.addColorStop(0.45, "#3a1828"); // warm mauve
    sg.addColorStop(0.72, "#7a3346"); // dusk rose
    sg.addColorStop(0.88, "#c96a4a"); // horizon ember
    sg.addColorStop(1.0, "#f0a86a"); // warm glow at the deck
    skctx.fillStyle = sg;
    skctx.fillRect(0, 0, 4, 256);
  }
  const skyTex = new THREE.CanvasTexture(skyCanvas);
  if ("colorSpace" in skyTex) (skyTex as any).colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;

  const camera = new THREE.PerspectiveCamera(64, w / h, 0.1, 140);
  camera.position.set(0, 8, 15);
  camera.lookAt(0, 0, -10);

  // Per-lane gemstone pad textures (built once, reused by every note).
  const padTextures = LANE_COLORS.map((c) => makePadTexture(THREE, c));

  // Floor grid (neon, additive).
  const grid = new THREE.GridHelper(120, 60, 0x6a3a4a, 0x3a2030);
  grid.position.z = -14;
  grid.renderOrder = -5;
  (grid.material as any).transparent = true;
  (grid.material as any).opacity = 0.32;
  scene.add(grid);

  // Lane glow strips + dividers.
  const laneStrips: any[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: LANE_COLORS[i],
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false, // highway always paints over the EDC backdrop
    });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.2, SPAWN_Z * -1 + HIT_Z + 4), mat);
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(laneX(i), -0.02, (SPAWN_Z + HIT_Z) / 2);
    strip.renderOrder = 8;
    scene.add(strip);
    laneStrips.push(strip);
  }

  // Scrolling beat lines — thin glowing rungs that march up the highway at the
  // tempo (classic Guitar Hero cue). Gives the lane rhythmic structure even
  // between notes. Spacing/scroll is driven from the BPM tracker in animate.
  const beatLines: any[] = [];
  const BEAT_LINE_N = 12;
  const laneSpan = laneX(LANE_COUNT - 1) - laneX(0) + 2.6;
  for (let i = 0; i < BEAT_LINE_N; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd9a8,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(laneSpan, 0.12), mat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, -0.01, SPAWN_Z + (i / BEAT_LINE_N) * (HIT_Z - SPAWN_Z));
    line.renderOrder = 6;
    scene.add(line);
    beatLines.push(line);
  }

  // Per-lane hit beams — a tall column of light that shoots up from the deck on
  // a hit (scale + opacity punch in animate). Bigger, more cinematic than a flat
  // flash.
  const flashMeshes: any[] = [];
  for (let i = 0; i < LANE_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: LANE_COLORS[i],
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 18), mat);
    mesh.position.set(laneX(i), 8, HIT_Z); // bottom near the deck, rising up
    mesh.renderOrder = 9;
    scene.add(mesh);
    flashMeshes.push(mesh);
  }

  // Hit line glow bar.
  const hitBarMat = new THREE.MeshBasicMaterial({
    color: 0xffe0b0,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const hitBar = new THREE.Mesh(
    new THREE.PlaneGeometry(laneX(LANE_COUNT - 1) - laneX(0) + 3, 0.5),
    hitBarMat,
  );
  hitBar.rotation.x = -Math.PI / 2;
  hitBar.position.set(0, 0.05, HIT_Z);
  hitBar.renderOrder = 10;
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
  const pPoints = new THREE.Points(pGeo, pMat);
  pPoints.renderOrder = 3; // hit-explosion particles ride on top
  scene.add(pPoints);

  // Starfield backdrop.
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(300 * 3);
  for (let i = 0; i < 300; i++) {
    sPos[i * 3] = (Math.random() - 0.5) * 120;
    sPos[i * 3 + 1] = Math.random() * 40 + 4;
    sPos[i * 3 + 2] = -Math.random() * 80 - 10;
  }
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(
    sGeo,
    new THREE.PointsMaterial({ color: 0xc98a6a, size: 0.25, transparent: true, opacity: 0.55 }),
  );
  stars.renderOrder = -6;
  scene.add(stars);

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
    bar.position.set((i - SPEC_N / 2) * 1.5, 7, -62);
    bar.renderOrder = -4;
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
    ring.renderOrder = 3;
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
    beam.position.set((i - (SPOT_N - 1) / 2) * 7, 30, -38);
    beam.renderOrder = -3;
    scene.add(beam);
    spotlights.push({ mesh: beam, phase: i * 1.15, hue: i / SPOT_N, baseX: (i - (SPOT_N - 1) / 2) * 7 });
  }

  // Laser fan from a single rig point.
  const lasers: any[] = [];
  for (let i = 0; i < 7; i++) {
    const mat = new THREE.LineBasicMaterial({
      color: 0xffb060,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
    });
    const g = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 24, -40),
      new THREE.Vector3((i - 3) * 9, 0, -8),
    ]);
    const line = new THREE.Line(g, mat);
    line.renderOrder = -3;
    scene.add(line);
    lasers.push({ mesh: line });
  }

  // Lightning bolt (jagged line, flashed on big hits).
  const ltMat = new THREE.LineBasicMaterial({
    color: 0xffd9a8,
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
  lightning.renderOrder = -2;
  scene.add(lightning);

  // ── Warm horizon sun glow ─────────────────────────────────────────────────
  // A big soft radial wash low on the horizon — the golden-hour light source
  // that makes the whole space feel warm and safe.
  const sunCanvas = document.createElement("canvas");
  sunCanvas.width = sunCanvas.height = 256;
  const sctx = sunCanvas.getContext("2d");
  if (sctx) {
    const g = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255, 224, 170, 0.95)");
    g.addColorStop(0.35, "rgba(255, 150, 110, 0.55)");
    g.addColorStop(0.7, "rgba(190, 90, 130, 0.18)");
    g.addColorStop(1, "rgba(190, 90, 130, 0)");
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, 256, 256);
  }
  const sunTex = new THREE.CanvasTexture(sunCanvas);
  const sunGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshBasicMaterial({
      map: sunTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  );
  sunGlow.position.set(0, 4, -66);
  sunGlow.renderOrder = -7;
  scene.add(sunGlow);

  // ── Volumetric god-rays ───────────────────────────────────────────────────
  // Soft light shafts fanning up from the sun. A vertical beam texture (bright,
  // narrow, fading toward the top) on a few angled planes = cheap god-rays that
  // sell depth + drama. They sway + shimmer with the music in animate.
  const rayCanvas = document.createElement("canvas");
  rayCanvas.width = 64;
  rayCanvas.height = 256;
  const rctx = rayCanvas.getContext("2d");
  if (rctx) {
    const rg = rctx.createLinearGradient(0, 256, 0, 0);
    rg.addColorStop(0, "rgba(255, 220, 170, 0.9)");
    rg.addColorStop(0.5, "rgba(255, 170, 120, 0.28)");
    rg.addColorStop(1, "rgba(255, 170, 120, 0)");
    rctx.fillStyle = rg;
    rctx.fillRect(0, 0, 64, 256);
    // Narrow the beam horizontally (feather the sides) with a destination mask.
    const hg = rctx.createLinearGradient(0, 0, 64, 0);
    hg.addColorStop(0, "rgba(0,0,0,0)");
    hg.addColorStop(0.5, "rgba(0,0,0,1)");
    hg.addColorStop(1, "rgba(0,0,0,0)");
    rctx.globalCompositeOperation = "destination-in";
    rctx.fillStyle = hg;
    rctx.fillRect(0, 0, 64, 256);
    rctx.globalCompositeOperation = "source-over";
  }
  const rayTex = new THREE.CanvasTexture(rayCanvas);
  const godRays: any[] = [];
  const RAY_N = 7;
  for (let i = 0; i < RAY_N; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: rayTex,
      color: 0xffce9a,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(13, 90), mat);
    ray.position.set(0, 30, -64);
    ray.rotation.z = (i - (RAY_N - 1) / 2) * 0.16; // fan
    ray.renderOrder = -6;
    scene.add(ray);
    godRays.push({ mesh: ray, baseRot: ray.rotation.z, phase: i * 0.9 });
  }

  // Soft glow halo laid over the hit line (fake bloom — the radial sun texture
  // stretched thin across the strike zone). Pulses with the bass in animate.
  const hitGlowMat = new THREE.MeshBasicMaterial({
    map: sunTex,
    color: 0xffe0b0,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const hitGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(laneX(LANE_COUNT - 1) - laneX(0) + 10, 9),
    hitGlowMat,
  );
  hitGlow.rotation.x = -Math.PI / 2;
  hitGlow.position.set(0, 0.04, HIT_Z);
  hitGlow.renderOrder = 7;
  scene.add(hitGlow);

  // ── Drifting warm bokeh ("fireflies") ─────────────────────────────────────
  // Slow, soft motes of light rising through the scene — calm, alive, friendly.
  const BOKEH_N = 70;
  const bGeo = new THREE.BufferGeometry();
  const bPos = new Float32Array(BOKEH_N * 3);
  const bCol = new Float32Array(BOKEH_N * 3);
  bokehVel = new Float32Array(BOKEH_N);
  const bc = new THREE.Color();
  for (let i = 0; i < BOKEH_N; i++) {
    bPos[i * 3] = (Math.random() - 0.5) * 64;
    bPos[i * 3 + 1] = Math.random() * 30;
    bPos[i * 3 + 2] = -6 - Math.random() * 44;
    bc.setHSL(0.05 + Math.random() * 0.08, 0.85, 0.62 + Math.random() * 0.2); // warm gold→peach
    bCol[i * 3] = bc.r;
    bCol[i * 3 + 1] = bc.g;
    bCol[i * 3 + 2] = bc.b;
    bokehVel[i] = 0.6 + Math.random() * 1.2;
  }
  bGeo.setAttribute("position", new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
  const bokehMat = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map: sunTex, // soft round falloff
  });
  const bokeh = new THREE.Points(bGeo, bokehMat);
  bokeh.renderOrder = -3;
  scene.add(bokeh);

  // ── Disco ball ────────────────────────────────────────────────────────────
  // Faceted sphere with random per-facet brightness; a global color multiply
  // (driven in animate) tints + pulses it like real mirror tiles catching the
  // beams. The scattered dot field below is the "reflected" light it throws.
  const ballGeo = new THREE.IcosahedronGeometry(2.4, 1).toNonIndexed();
  const vcount = ballGeo.attributes.position.count;
  const bcol = new Float32Array(vcount * 3);
  for (let f = 0; f < vcount; f += 3) {
    const shade = 0.4 + Math.random() * 0.6; // each triangular facet a mirror tile
    for (let k = 0; k < 3; k++) {
      bcol[(f + k) * 3] = shade;
      bcol[(f + k) * 3 + 1] = shade;
      bcol[(f + k) * 3 + 2] = shade * 1.08;
    }
  }
  ballGeo.setAttribute("color", new THREE.BufferAttribute(bcol, 3));
  const discoBall = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ vertexColors: true }));
  discoBall.position.set(0, 22, -26);
  discoBall.renderOrder = -1;
  scene.add(discoBall);
  // Hanging rod.
  const rod = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 32, -26),
      new THREE.Vector3(0, 24.4, -26),
    ]),
    new THREE.LineBasicMaterial({ color: 0x2a3550 }),
  );
  rod.renderOrder = -1;
  scene.add(rod);
  // Reflected-light fleck field scattered around the ball.
  const DOT_N = 150;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DOT_N * 3);
  const dCol = new Float32Array(DOT_N * 3);
  const dPhase = new Float32Array(DOT_N);
  const tmp = new THREE.Color();
  for (let i = 0; i < DOT_N; i++) {
    dPos[i * 3] = (Math.random() - 0.5) * 72;
    dPos[i * 3 + 1] = Math.random() * 28;
    dPos[i * 3 + 2] = -8 - Math.random() * 46;
    tmp.setHSL(Math.random(), 0.9, 0.6);
    dCol[i * 3] = tmp.r;
    dCol[i * 3 + 1] = tmp.g;
    dCol[i * 3 + 2] = tmp.b;
    dPhase[i] = Math.random() * Math.PI * 2;
  }
  dGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute("color", new THREE.BufferAttribute(dCol, 3));
  const discoDotMat = new THREE.PointsMaterial({
    size: 0.5,
    vertexColors: true,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const discoDots = new THREE.Points(dGeo, discoDotMat);
  discoDots.renderOrder = -4;
  scene.add(discoDots);

  // Keep the WebGL viewport matched to the host as it resizes (fullscreen toggle).
  const resizeObs = new ResizeObserver(() => {
    const cw = container.clientWidth || w;
    const ch = container.clientHeight || h;
    renderer.setSize(cw, ch);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  });
  resizeObs.observe(container);

  three = {
    THREE,
    scene,
    camera,
    renderer,
    flashMeshes,
    laneStrips,
    beatLines,
    hitBar,
    hitBarMat,
    specBars,
    rings,
    spotlights,
    lasers,
    lightning,
    discoBall,
    discoDots,
    discoDotMat,
    bokeh,
    sunGlow,
    godRays,
    glowTex: sunTex, // soft radial used for note light-pools + fake bloom
    padTextures,
    hitGlowMat,
    resizeObs,
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

// `arrival` is the SONG time (player.positionSecs) at which the note should
// reach the hit line — the same clock used to judge a hit, so visuals and
// judgement never drift apart.
function spawnNote(lane: number, arrival: number): void {
  if (!three) return;
  const { THREE, scene } = three;
  const color = LANE_COLORS[lane];
  const padTex = three.padTextures[lane];
  // Rectangular gemstone pad (wider than tall), lying on the lane so it slides
  // toward the hit line like a classic note. Normal-blended so the gradient
  // fill + border read as a real gem (the additive glow pool below adds bloom).
  const mat = new THREE.MeshBasicMaterial({
    map: padTex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1), mat);
  mesh.rotation.x = -Math.PI / 2; // lie flat on the lane
  mesh.position.set(laneX(lane), 0.18, SPAWN_Z);
  mesh.renderOrder = 14;
  scene.add(mesh);
  // Glossy-floor reflection: a dim, mirrored pad under the deck.
  const refl = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.1),
    new THREE.MeshBasicMaterial({
      map: padTex,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      depthTest: false,
    }),
  );
  refl.rotation.x = -Math.PI / 2;
  refl.position.set(laneX(lane), -0.18, SPAWN_Z);
  refl.renderOrder = 12;
  scene.add(refl);
  // Soft additive light pool under the pad (radial texture = fake bloom).
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    map: three.glowTex,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), glowMat);
  glow.position.set(laneX(lane), 0.06, SPAWN_Z);
  glow.rotation.x = -Math.PI / 2;
  glow.renderOrder = 13;
  scene.add(glow);
  // Soft comet trail behind the pad (additive streak in the lane colour).
  const trailMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 6), trailMat);
  trail.rotation.x = -Math.PI / 2;
  trail.position.set(laneX(lane), 0.04, SPAWN_Z - 3.5);
  trail.renderOrder = 13;
  scene.add(trail);
  notes.push({ lane, arrival, mesh, glow, trail, refl, judged: false });
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
  const t = smoothSongT; // judge on the same smoothed clock that drives the highway
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
    disposeNote(best);
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

  // Advance the smoothed visual clock by real frame time, then ease it toward
  // the authoritative position so notes glide every frame (not in coarse steps).
  const nowMs = performance.now();
  const frameDt = lastFrameMs ? Math.min(0.1, (nowMs - lastFrameMs) / 1000) : 1 / 60;
  lastFrameMs = nowMs;
  const realPos = player.positionSecs;
  if (player.isPlaying) {
    smoothSongT += frameDt;
    const drift = realPos - smoothSongT;
    if (Math.abs(drift) > 0.2) smoothSongT = realPos; // seek / big correction → snap
    else smoothSongT += drift * 0.08; // otherwise gently re-sync
  } else {
    smoothSongT = realPos;
  }
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
  const songT = smoothSongT;
  while (chartIndex < chart.length && songT >= chart[chartIndex].time - TRAVEL) {
    const cn = chart[chartIndex];
    if (cn.time - songT > -0.3) spawnNote(cn.lane, cn.time);
    chartIndex++;
  }

  // Live onsets only drive eye-candy now (sky confetti pops + lightning).
  runningAvg = runningAvg * 0.92 + energy * 0.08;
  if (player.isPlaying && isOnset(energy, runningAvg) && t - lastSpawn > 0.12) {
    spawnCounter++;
    const popColor = LANE_COLORS[spawnCounter % LANE_COLORS.length];
    spawnBurst((Math.random() - 0.5) * 36, 20 + Math.random() * 8, -34, popColor, 24, 9);
    lastSpawn = t;
    // Estimate tempo from the gap between beats (ignore implausible intervals).
    const gap = t - lastBeatT;
    if (gap > 0.25 && gap < 1.5) beatInterval += (gap - beatInterval) * 0.2;
    lastBeatT = t;
  }

  // Reactive spectrum wall.
  const data = freq.value;
  for (let i = 0; i < specBars.length; i++) {
    const v = data && data.length ? data[(i * 7) % data.length] / 255 : 0;
    const bar = specBars[i];
    bar.scale.y = 0.5 + v * 9;
    bar.position.y = 2 + (bar.scale.y * 1) / 2;
    // Warm band only (magenta → red → orange → gold), drifting gently.
    const hue = (330 + (i / specBars.length) * 120 + t * 12) % 360;
    bar.material.color.setHSL((fever ? 45 : hue) / 360, 0.9, 0.55);
    bar.material.opacity = 0.08 + v * 0.18;
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
  // Spotlight beams sweep TO the music: treble drives sweep speed, mid the
  // sweep width, bass kicks the tilt + sways the rig side to side.
  // Calmer, slower sweep — gentle searchlights, not a strobe.
  const sweepSpeed = 0.28 + bands.treble * 1.5;
  const sweepWidth = 0.32 + bands.mid * 0.85;
  for (let i = 0; i < spotlights.length; i++) {
    const s = spotlights[i];
    const dir = i % 2 === 0 ? 1 : -1;
    s.mesh.rotation.z = Math.sin(t * sweepSpeed + s.phase) * sweepWidth * dir;
    s.mesh.rotation.x = -0.22 + Math.cos(t * (0.3 + bands.mid) + s.phase) * 0.16 - bands.bass * 0.18;
    s.mesh.position.x = s.baseX + Math.sin(t * 0.45 + s.phase) * bands.bass * 4;
    // Fold the hue into a warm band (pink → red → orange → gold) so beams stay cozy.
    const raw = (s.hue + t * 0.04 + bands.treble * 0.2) % 1;
    const hue = (0.95 + raw * 0.17) % 1;
    s.mesh.material.color.setHSL(fever ? 0.1 : hue, 0.95, 0.6);
    // Dimmer than before so the beams set mood without washing out the highway.
    s.mesh.material.opacity = 0.03 + bands.mid * 0.12 + bands.treble * 0.08 + bands.bass * 0.04;
  }
  // Laser fan flicker (treble-driven), hue cycling.
  for (let i = 0; i < lasers.length; i++) {
    const m = lasers[i].mesh.material;
    m.opacity = 0.02 + bands.treble * 0.3;
    m.color.setHSL((0.05 + ((t * 0.05 + i * 0.03) % 0.12)) % 1, 0.95, 0.6); // warm gold band
  }
  // Lightning strikes on hard bass (rate-limited) + its flash.
  three.ltCooldown -= 1 / 60;
  if (bands.bass > 0.62 && three.ltCooldown <= 0 && Math.random() < 0.18) {
    strikeLightning();
    three.ltCooldown = 1.1; // rare, so it reads as a warm shimmer not a storm
  }
  if (three.ltLife > 0) {
    three.ltLife -= 0.14;
    three.lightning.material.opacity = Math.max(0, three.ltLife) * 0.6;
    if (three.ltLife <= 0) three.lightning.visible = false;
    flash.value = Math.max(flash.value, three.ltLife * 0.25);
  }

  // Disco ball: spin to the tempo (BPM), tint + pulse the facets, and twinkle
  // the reflected-light flecks it throws across the scene.
  if (three.discoBall) {
    const bpm = 60 / beatInterval; // rough, from the beat tracker
    // Club-ball RPM scaled to tempo: ~1 rad/s at 120 BPM, only when playing.
    const targetSpin = player.isPlaying ? 0.004 + (bpm / 120) * 0.014 : 0.001;
    discoSpin += (targetSpin - discoSpin) * 0.05;
    three.discoBall.rotation.y += discoSpin;
    three.discoBall.rotation.x = 0.18 + Math.sin(t * 0.3) * 0.05;
    three.discoBall.material.color.setHSL((t * 0.04) % 1, 0.3, 0.72 + bands.bass * 0.28);
    three.discoDots.rotation.y += discoSpin * 1.6 + bands.mid * 0.01;
    three.discoDotMat.opacity = 0.22 + bands.treble * 0.55 + bands.bass * 0.12;
    three.discoDotMat.size = 0.42 + bands.bass * 0.5;
  }

  // Sun glow breathes slowly with the music — a calm, warm heartbeat.
  if (three.sunGlow) {
    const pulse = 1 + Math.sin(t * 0.6) * 0.03 + bands.bass * 0.05;
    three.sunGlow.scale.setScalar(pulse);
    three.sunGlow.material.opacity = 0.85 + bands.bass * 0.15;
  }

  // God-rays: gentle sway + a soft shimmer that rises with mid/treble energy.
  if (three.godRays) {
    for (const r of three.godRays) {
      r.mesh.rotation.z = r.baseRot + Math.sin(t * 0.25 + r.phase) * 0.05;
      r.mesh.material.opacity = 0.05 + bands.mid * 0.12 + bands.treble * 0.1 + Math.sin(t * 0.8 + r.phase) * 0.02;
    }
  }

  // Warm bokeh motes drift slowly upward and wrap — gentle, alive ambience.
  if (three.bokeh) {
    const pos = three.bokeh.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < bokehVel.length; i++) {
      pos[i * 3 + 1] += bokehVel[i] * (1 / 60) * (1 + bands.mid * 0.6);
      pos[i * 3] += Math.sin(t * 0.5 + i) * 0.004; // soft sway
      if (pos[i * 3 + 1] > 32) {
        pos[i * 3 + 1] = -1;
        pos[i * 3] = (Math.random() - 0.5) * 64;
      }
    }
    three.bokeh.geometry.attributes.position.needsUpdate = true;
    three.bokeh.material.opacity = 0.4 + bands.treble * 0.3;
  }

  // Advance notes; a missed (un-pressed) note just resets the combo — the game
  // keeps going until the song ends.
  for (const n of notes) {
    // Position driven by the SONG clock (same as judging) → no visual/hit drift.
    const progress = 1 - (n.arrival - songT) / TRAVEL;
    const z = SPAWN_Z + progress * (HIT_Z - SPAWN_Z);
    n.mesh.position.z = z;
    // Soft ease-in over the first stretch of travel (no hard pop at spawn).
    const appear = Math.min(1, Math.max(0, progress * 6));
    const ease = appear * appear * (3 - 2 * appear); // smoothstep
    const s = ease * (1 + bands.bass * 0.12);
    n.mesh.scale.set(s, s, s);
    if (n.refl) {
      n.refl.position.z = z;
      n.refl.scale.set(s, s, s);
      // Reflection fades as the pad nears the camera (off the glossy deck).
      n.refl.material.opacity = Math.max(0, 0.24 * ease * (1 - progress * 0.7));
    }
    if (n.glow) {
      n.glow.position.z = z;
      n.glow.scale.setScalar(ease);
    }
    if (n.trail) n.trail.position.z = z - 3.5;
    if (!n.judged && songT - n.arrival > HIT_WINDOW) {
      n.judged = true;
      registerJudgement("miss", n.lane);
    }
  }
  notes = notes.filter((n) => {
    if (n.judged && songT - n.arrival > 0.2) {
      disposeNote(n);
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

  // Lane beams + beat-reactive strips. The beam stretches taller + brighter the
  // harder the lane was just hit, then settles.
  for (let i = 0; i < LANE_COUNT; i++) {
    laneFlash[i] = Math.max(0, laneFlash[i] - 0.07);
    const fm = flashMeshes[i];
    fm.material.opacity = laneFlash[i] * 0.6;
    fm.scale.y = 0.6 + laneFlash[i] * 1.1; // shoots up on a hit
    laneStrips[i].material.opacity = 0.05 + bands.bass * 0.12 + laneFlash[i] * 0.1;
  }
  hitBarMat.opacity = 0.6 + bands.bass * 0.4;
  if (three.hitGlowMat) three.hitGlowMat.opacity = 0.35 + bands.bass * 0.35;

  // Beat lines march up the highway at the tempo (spacing = one beat in z).
  if (three.beatLines) {
    const noteSpeed = (HIT_Z - SPAWN_Z) / TRAVEL; // units/sec the notes travel
    const spacing = noteSpeed * Math.max(0.3, Math.min(1.2, beatInterval));
    const span = three.beatLines.length * spacing;
    const step = player.isPlaying ? noteSpeed / 60 : 0;
    for (const line of three.beatLines) {
      line.position.z += step;
      if (line.position.z > HIT_Z + 3) line.position.z -= span;
      const prog = (line.position.z - SPAWN_Z) / (HIT_Z - SPAWN_Z);
      line.material.opacity = Math.max(0, 0.05 + Math.min(1, prog) * 0.2 - Math.max(0, prog - 1) * 0.6);
    }
  }

  // Camera stays locked (no bob/shake/punch) — the highway never jitters.
  void camBaseY;
  flash.value = Math.max(0, flash.value - 0.05);
  // Warm dusk that breathes a little with the bass — never goes cold.
  renderer.setClearColor(
    fever
      ? new THREE.Color(0x2a1408).offsetHSL(0, 0, bands.bass * 0.12)
      : new THREE.Color(0x1c0f1a).offsetHSL(0, 0, bands.bass * 0.06),
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
  try {
    const THREE = await loadThree();
    if (!THREE) throw new Error("three.js global not found");
    init(THREE);
    // Only claim the keyboard once init succeeds, so transport shortcuts aren't
    // suppressed while a failed game shows its error.
    ui.setInteractiveVisualizer(true);
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
      three.resizeObs?.disconnect();
      // Dispose every live note, then every geometry/material in the scene graph
      // (spotlights, lasers, spectrum bars, particle/star/grid buffers, rings).
      for (const n of notes) disposeNote(n);
      notes = [];
      three.scene.traverse((o: any) => {
        o.geometry?.dispose?.();
        const mat = o.material;
        if (mat)
          (Array.isArray(mat) ? mat : [mat]).forEach((m: any) => {
            m?.map?.dispose?.();
            m?.dispose?.();
          });
      });
      // Shared lane pad textures aren't owned by a single mesh — dispose once.
      for (const tex of three.padTextures ?? []) tex?.dispose?.();
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
  background: #1c0f1a;
  overflow: hidden;
}
.kh-flash {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: radial-gradient(circle, rgba(255, 240, 210, 0.55), rgba(255, 170, 120, 0.2) 60%, transparent 75%);
  pointer-events: none;
  transition: opacity 0.1s ease;
}
/* Edge vignette — pulls focus to the highway, adds cinematic depth. */
.kh-vignette {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  background: radial-gradient(ellipse 75% 70% at 50% 42%, transparent 55%, rgba(20, 8, 16, 0.55) 100%);
}
/* Faint animated film grain over everything. */
.kh-grain {
  position: absolute;
  inset: -50%;
  z-index: 4;
  pointer-events: none;
  opacity: 0.05;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  animation: kh-grain-shift 0.5s steps(2) infinite;
}
@keyframes kh-grain-shift {
  0% { transform: translate(0, 0); }
  50% { transform: translate(-3%, 2%); }
  100% { transform: translate(2%, -3%); }
}
@media (prefers-reduced-motion: reduce) {
  .kh-grain { animation: none; }
}
/* Slim song-progress bar across the very top. */
.kh-progress {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  z-index: 6;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}
.kh-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #ffce9a, #ff9e7d, #ffd27f);
  box-shadow: 0 0 10px rgba(255, 180, 120, 0.8);
  transition: width 0.2s linear;
}
.kh-nowplaying {
  position: absolute;
  top: 0.55rem;
  right: 0.85rem;
  z-index: 6;
  max-width: 45%;
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(255, 233, 210, 0.85);
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
  pointer-events: none;
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
  display: inline-block;
  transition: transform 0.08s ease;
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
  color: #ffd27f;
}
.kh-mult.m3 {
  color: #ffb054;
}
.kh-mult.m4 {
  color: #ff7e6b;
  text-shadow: 0 0 10px #ff7e6b;
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
  color: #ffcaa0;
  font-weight: 700;
  display: inline-block;
  animation: kh-combo-pop 0.22s ease-out;
}
@keyframes kh-combo-pop {
  0% { transform: scale(1.45); color: #fff; }
  100% { transform: scale(1); }
}
.kh-message {
  color: #ffd86e;
  font-weight: 800;
  font-size: 1.1rem;
  text-shadow: 0 0 12px rgba(255, 216, 110, 0.6);
  display: inline-block;
  animation: kh-msg-in 0.3s cubic-bezier(0.2, 1.4, 0.4, 1);
}
@keyframes kh-msg-in {
  0% { transform: translateY(8px) scale(0.7); opacity: 0; }
  100% { transform: translateY(0) scale(1); opacity: 1; }
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
  background: radial-gradient(ellipse at 50% 38%, rgba(58, 28, 36, 0.92), rgba(20, 8, 16, 0.94));
  color: #fff;
  text-align: center;
  animation: kh-results-in 0.45s ease-out;
}
@keyframes kh-results-in {
  0% { opacity: 0; transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}
.kh-result-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.3rem 1.6rem;
  margin: 0;
  font-size: 1.1rem;
}
.kh-result-grid dt {
  color: #e0b48a;
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
