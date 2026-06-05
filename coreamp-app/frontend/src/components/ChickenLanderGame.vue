<template>
  <div class="cl-game" data-test="chicken-lander">
    <canvas ref="canvasEl" class="cl-canvas" width="640" height="360"></canvas>
    <div class="cl-hint">SPACE flap · ← → move · ENTER restart · Safe ≤ 4.0 · Bounce ≤ 7.0 · Boom &gt; 7.0</div>
    <button class="cl-close" data-test="cl-close" aria-label="Exit game" @click="$emit('close')">✕</button>
    <div v-if="error" class="cl-error small">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { extractBands } from "@/visualizer/bands";
import { useUiStore } from "@/stores/ui";

defineEmits<{ (e: "close"): void }>();

const canvasEl = ref<HTMLCanvasElement | null>(null);
const error = ref("");
const { freq } = useFrequencyData();
const ui = useUiStore();

let raf = 0;
let beat = 0; // beat-flash amount, decays
let runningAvg = 0;
let bgScale = 1.5; // smoothed bg zoom; pulses up ~20% on bass
let cleanup: (() => void) | null = null;

onMounted(() => {
  ui.setInteractiveVisualizer(true);
  if (!canvasEl.value) return;
  const canvas = canvasEl.value as HTMLCanvasElement;
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) {
    error.value = "Canvas 2D unavailable.";
    return;
  }
  const ctx: CanvasRenderingContext2D = ctx2d;
  ctx.imageSmoothingEnabled = false;

  // ── Original Chicken Lander (mechanics unchanged) ──────────────────────────
  const CELL = 64;
  const SPRITE_SCALE = 1;
  const BIRD_FRAMES = [
    { c: 0, r: 0 },
    { c: 1, r: 0 },
    { c: 2, r: 0 },
  ];
  const PLATFORM_FRAMES = { left: { c: 0, r: 1 }, mid: { c: 1, r: 1 }, right: { c: 2, r: 1 } };
  const EXPLOSION_FRAMES = [
    { c: 0, r: 2 },
    { c: 1, r: 2 },
    { c: 2, r: 2 },
  ];

  const img = new Image();
  img.src = "/games/chicken-lander/sprites.png";
  const bg = new Image();
  bg.src = "/games/chicken-lander/bg.png";
  let bgReady = false;
  let bgOffset = 0;
  bg.onload = () => (bgReady = true);

  function drawFrameRaw(frame: any, dx: number, dy: number, scale = SPRITE_SCALE, angle = 0): void {
    const sx = frame.c * CELL;
    const sy = frame.r * CELL;
    const w = CELL * scale;
    const h = CELL * scale;
    if (angle === 0) {
      ctx.drawImage(img, sx, sy, CELL, CELL, dx, dy, w, h);
    } else {
      ctx.save();
      ctx.translate(dx + w / 2, dy + h / 2);
      ctx.rotate(angle);
      ctx.drawImage(img, sx, sy, CELL, CELL, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  const STATE_PLAY = 0;
  const STATE_BOUNCE = 1;
  const STATE_EXPLODE = 2;
  const STATE_WIN = 3;
  const STATE_GONE = 4;

  const game: any = {
    state: STATE_PLAY,
    bird: { x: 0, y: 0, vx: 0, vy: 0, w: CELL, h: CELL, frame: 0, frameTime: 0, angle: 0, spin: 0, spinHold: 0 },
    platform: null,
    gravity: 0.2,
    flap: -3.96,
    maxVy: 10,
    moveAccel: 0.55,
    maxVx: 4.5,
    moveFriction: 0.86,
    safeVy: 4.0,
    bounceVy: 7.0,
    explosion: { frame: 0, frameTime: 0, x: 0, y: 0, done: false, goneTime: 0 },
  };

  function buildLevel(): void {
    const W = canvas.width;
    const H = canvas.height;
    const tileW = CELL;
    const pCells = 2 + Math.floor(Math.random() * 4);
    const maxX = W - pCells * tileW;
    const px = Math.floor(Math.random() * (maxX + 1));
    const py = H - tileW - 8;
    const tiles = [];
    for (let i = 0; i < pCells; i++) {
      let f;
      if (pCells === 1) f = PLATFORM_FRAMES.mid;
      else if (i === 0) f = PLATFORM_FRAMES.left;
      else if (i === pCells - 1) f = PLATFORM_FRAMES.right;
      else f = PLATFORM_FRAMES.mid;
      tiles.push({ fx: px + i * tileW, fy: py, frame: f });
    }
    game.platform = { x: px, y: py, w: pCells * tileW, h: tileW, tiles };
  }

  function resetBird(): void {
    const b = game.bird;
    b.x = canvas.width / 2 - b.w / 2;
    b.y = 20;
    b.vx = b.vy = 0;
    b.frame = 0;
    b.frameTime = 0;
    b.angle = b.spin = b.spinHold = 0;
    game.state = STATE_PLAY;
    Object.assign(game.explosion, { frame: 0, frameTime: 0, done: false, goneTime: 0 });
  }

  function startExplosion(): void {
    game.state = STATE_EXPLODE;
    game.explosion.x = game.bird.x;
    game.explosion.y = game.bird.y;
    Object.assign(game.explosion, { frame: 0, frameTime: 0, done: false, goneTime: 0 });
  }

  function startBounce(): void {
    game.state = STATE_BOUNCE;
    const speed = Math.max(Math.abs(game.bird.vy) * 0.85, 5.5);
    const angle = (Math.random() * 0.7 + 0.15) * Math.PI;
    const dir = Math.random() < 0.5 ? -1 : 1;
    game.bird.vx = Math.cos(angle) * speed * dir;
    game.bird.vy = -Math.sin(angle) * speed;
    game.bird.spin = 0.64;
    game.bird.spinHold = 0;
  }

  const keys = { left: false, right: false };

  function action(): void {
    if (game.state === STATE_PLAY) {
      game.bird.vy = game.flap;
    } else if (game.state === STATE_BOUNCE) {
      game.bird.vy = game.flap;
      game.bird.angle = 0;
      game.bird.spin = 0;
      game.state = STATE_PLAY;
    }
  }

  function restart(): void {
    if (
      game.state === STATE_WIN ||
      game.state === STATE_EXPLODE ||
      game.state === STATE_GONE ||
      game.state === STATE_BOUNCE
    ) {
      buildLevel();
      resetBird();
    }
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.code === "Space") {
      e.preventDefault();
      action();
    } else if (e.code === "Enter" || e.code === "NumpadEnter") {
      restart();
    } else if (e.code === "ArrowLeft") {
      keys.left = true;
      e.preventDefault();
    } else if (e.code === "ArrowRight") {
      keys.right = true;
      e.preventDefault();
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    if (e.code === "ArrowLeft") keys.left = false;
    if (e.code === "ArrowRight") keys.right = false;
  }
  function onClick(): void {
    action();
  }
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("click", onClick);

  function update(dt: number): void {
    const bird = game.bird;
    const p = game.platform;
    if (game.state === STATE_PLAY || game.state === STATE_BOUNCE) {
      bgOffset = Math.sin(performance.now() / 3000) * 80;
      if (game.state === STATE_PLAY) {
        if (keys.left) bird.vx -= game.moveAccel;
        if (keys.right) bird.vx += game.moveAccel;
        if (!keys.left && !keys.right) bird.vx *= game.moveFriction;
        bird.vx = Math.max(-game.maxVx, Math.min(game.maxVx, bird.vx));
      }
      bird.x += bird.vx;
      bird.vy = Math.min(game.maxVy, bird.vy + game.gravity);
      bird.y += bird.vy;

      if (bird.x + bird.w < 0 || bird.x > canvas.width || bird.y > canvas.height + 40) {
        startExplosion();
        return;
      }
      bird.frameTime += dt;
      if (bird.frameTime > 80) {
        bird.frame = (bird.frame + 1) % BIRD_FRAMES.length;
        bird.frameTime = 0;
      }
      if (game.state === STATE_BOUNCE) {
        bird.spinHold += dt;
        if (bird.spinHold < 350) bird.angle += bird.spin;
        else bird.angle *= 0.96;
        if (bird.angle > Math.PI * 2) bird.angle -= Math.PI * 2;
      }
      if (bird.y + bird.h >= p.y && bird.x + bird.w > p.x && bird.x < p.x + p.w) {
        if (game.state === STATE_BOUNCE) {
          bird.y = p.y - bird.h;
          startExplosion();
          return;
        }
        const speed = Math.abs(bird.vy);
        bird.y = p.y - bird.h;
        if (speed <= game.safeVy) {
          bird.vy = 0;
          game.state = STATE_WIN;
        } else if (speed <= game.bounceVy) startBounce();
        else startExplosion();
        return;
      }
    } else if (game.state === STATE_EXPLODE) {
      game.explosion.frameTime += dt;
      if (game.explosion.frameTime > 110) {
        game.explosion.frame++;
        game.explosion.frameTime = 0;
        if (game.explosion.frame >= EXPLOSION_FRAMES.length) {
          game.explosion.frame = EXPLOSION_FRAMES.length - 1;
          game.explosion.done = true;
          game.state = STATE_GONE;
          game.explosion.goneTime = 0;
        }
      }
    } else if (game.state === STATE_GONE) {
      game.explosion.goneTime += dt;
    }
  }

  // ── Music-reactive backdrop (visual only) ─────────────────────────────────
  function drawReactiveBackdrop(bands: { bass: number; mid: number; treble: number }): void {
    const W = canvas.width;
    const H = canvas.height;
    const data = freq.value;
    if (data && data.length) {
      const bars = 32;
      const step = Math.floor(data.length / bars) || 1;
      const bw = W / bars;
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < bars; i++) {
        const v = data[i * step] / 255;
        const bh = v * H * 0.72;
        const hue = (i / bars) * 300 + performance.now() * 0.02;
        ctx.fillStyle = `hsla(${hue % 360}, 95%, 58%, ${0.22 + v * 0.25})`;
        ctx.fillRect(i * bw, H - bh, bw - 1, bh);
      }
      ctx.globalCompositeOperation = "source-over";
    }
    // Bass brightness/warmth pulse over the scene.
    if (bands.bass > 0.01) {
      ctx.fillStyle = `rgba(255, 180, 90, ${bands.bass * 0.14})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function draw(bands: { bass: number; mid: number; treble: number }): void {
    const W = canvas.width;
    const H = canvas.height;

    if (bgReady) {
      const scale = bgScale;
      const dw = W * scale;
      const dh = H * scale;
      const dy = -(H * (scale - 1) / 2);
      // Tile across the full width starting from a guaranteed <= 0 offset so a
      // positive parallax offset never leaves an uncovered strip at the edge.
      const startX = -((((bgOffset * scale) % dw) + dw) % dw);
      for (let x = startX; x < W; x += dw) {
        ctx.drawImage(bg, x, dy, dw, dh);
      }
    } else {
      ctx.fillStyle = "#2b1a0e";
      ctx.fillRect(0, 0, W, H);
    }

    drawReactiveBackdrop(bands);

    for (const t of game.platform.tiles) drawFrameRaw(t.frame, t.fx, t.fy);

    if (game.state === STATE_PLAY || game.state === STATE_BOUNCE || game.state === STATE_WIN) {
      const frame = BIRD_FRAMES[game.bird.frame];
      const wobble = game.state === STATE_WIN ? Math.sin(Date.now() / 150) : 0;
      drawFrameRaw(frame, game.bird.x, game.bird.y + wobble, SPRITE_SCALE, game.bird.angle);
    } else if (game.state === STATE_EXPLODE) {
      // Explosion scales with current track energy.
      const energy = bands.bass * 0.7 + bands.mid * 0.3;
      const s = SPRITE_SCALE * (1.2 + energy * 1.2);
      const frame = EXPLOSION_FRAMES[game.explosion.frame];
      const cx = game.explosion.x + (CELL - CELL * s) / 2;
      const cy = game.explosion.y + (CELL - CELL * s) / 2;
      drawFrameRaw(frame, cx, cy, s);
    }

    // Beat flash overlay.
    if (beat > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${beat * 0.22})`;
      ctx.fillRect(0, 0, W, H);
    }

    // HUD text (unchanged from original).
    ctx.textAlign = "left";
    if (game.state === STATE_PLAY) {
      ctx.font = "bold 12px monospace";
      ctx.fillStyle = "#ffeb99";
      ctx.fillText("vy: " + game.bird.vy.toFixed(2), 8, 16);
    } else if (game.state === STATE_WIN) {
      banner("GENTLE LANDING!", "#9eff7a");
    } else if (game.state === STATE_GONE) {
      banner("BIRD DOWN", "#ff6b6b");
    } else if (game.state === STATE_EXPLODE) {
      ctx.fillStyle = "#ff6b6b";
      ctx.font = "bold 16px monospace";
      ctx.textAlign = "center";
      ctx.fillText("BOOM!", W / 2, 30);
      ctx.textAlign = "left";
    } else if (game.state === STATE_BOUNCE) {
      ctx.fillStyle = "#ffd166";
      ctx.font = "bold 14px monospace";
      ctx.textAlign = "center";
      ctx.fillText("OUCH! bounce", W / 2, 30);
      ctx.textAlign = "left";
    }
  }

  function banner(text: string, color: string): void {
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H / 2 - 28, W, 56);
    ctx.fillStyle = color;
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, H / 2 - 2);
    ctx.fillStyle = "#eee";
    ctx.font = "11px monospace";
    ctx.fillText("SPACE / click to retry", W / 2, H / 2 + 18);
    ctx.textAlign = "left";
  }

  let last = performance.now();
  function loop(now: number): void {
    raf = requestAnimationFrame(loop);
    const dt = now - last;
    last = now;
    const bands = extractBands(freq.value);
    const energy = bands.bass * 0.7 + bands.mid * 0.3;
    runningAvg = runningAvg * 0.92 + energy * 0.08;
    if (energy > 0.06 && energy > runningAvg * 1.45) beat = 1;
    beat = Math.max(0, beat - 0.06);
    // Bg zooms up to +20% on bass and eases back — a gentle pulse to the beat.
    bgScale += (1.5 * (1 + bands.bass * 0.2) - bgScale) * 0.18;
    update(dt);
    if (game.platform) draw(bands);
  }

  // Match the backing-store aspect to the host so fullscreen never stretches the
  // scene. Internal height is fixed (sprite scale stays constant); width tracks
  // the container's aspect, and the level is re-laid within the new bounds.
  const BASE_H = 360;
  function resize(): void {
    const host = canvas.parentElement;
    const cw = host?.clientWidth || 640;
    const ch = host?.clientHeight || 360;
    const aspect = cw / ch || 16 / 9;
    canvas.height = BASE_H;
    canvas.width = Math.round(BASE_H * aspect);
    ctx.imageSmoothingEnabled = false; // reset: sizing clears canvas state
    if (game.platform) buildLevel();
    game.bird.x = Math.max(0, Math.min(canvas.width - game.bird.w, game.bird.x));
  }
  const resizeObs = new ResizeObserver(() => resize());
  resizeObs.observe(canvas.parentElement || canvas);

  img.onload = () => {
    resize();
    buildLevel();
    resetBird();
    raf = requestAnimationFrame(loop);
  };
  img.onerror = () => {
    error.value = "Failed to load Chicken Lander sprites.";
  };

  cleanup = () => {
    resizeObs.disconnect();
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    canvas.removeEventListener("click", onClick);
  };
});

onBeforeUnmount(() => {
  ui.setInteractiveVisualizer(false);
  if (raf) cancelAnimationFrame(raf);
  cleanup?.();
});
</script>

<style scoped>
.cl-game {
  position: absolute;
  inset: 0;
  background: #2b1a0e;
  overflow: hidden;
}
.cl-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
.cl-hint {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0.35rem;
  text-align: center;
  font-family: monospace;
  font-size: 0.72rem;
  color: #ffe;
  opacity: 0.8;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}
.cl-close {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 5;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  border-radius: 0.25rem;
  line-height: 1;
  padding: 0.2rem 0.45rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.cl-game:hover .cl-close {
  opacity: 1;
}
.cl-error {
  position: absolute;
  left: 0.75rem;
  top: 2rem;
  color: #f88;
}
</style>
