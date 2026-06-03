// @ts-nocheck
// Sound Runner engine: a free-movement side-scrolling platformer over a
// song-shaped level, with Space-Invader enemies and a music-reactive sky.
import { LEVEL } from "@/visualizer/soundLevel";

const G = 0.5; // gravity
const JUMP = -7.6; // jump impulse
const ACC = 0.55; // horizontal acceleration
const FRICTION = 0.82; // ground friction
const MAX_VX = 2.6;
const PLAYER_W = 12;
const PLAYER_H = 14;
const BULLET_SPEED = 4.5;
const SHOOT_COOLDOWN = 0.22; // seconds
const KILL_POINTS = 50;

export function createSoundRunner(container, level, getBands, onGameOver) {
  const { VW, VH, COL_W } = LEVEL;
  const canvas = document.createElement("canvas");
  canvas.width = VW;
  canvas.height = VH;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.imageRendering = "pixelated";
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const keys = {};
  let jumpEdge = false;
  const onKeyDown = (e) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "x", "X"].includes(e.key)) {
      e.preventDefault();
      if ((e.key === "ArrowUp" || e.key === " ") && !keys[e.key]) jumpEdge = true;
      keys[e.key] = true;
    }
  };
  const onKeyUp = (e) => {
    keys[e.key] = false;
  };
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  const clouds = Array.from({ length: 6 }, () => ({
    x: Math.random() * VW,
    y: 10 + Math.random() * 60,
    s: 0.6 + Math.random() * 0.8,
    spd: 0.05 + Math.random() * 0.1,
  }));

  const s = {
    px: 40, py: 0, vx: 0, vy: 0, onGround: false, facing: 1,
    camX: 0, dist: 0, kills: 0, dead: false, shootCd: 0,
    bullets: [], enemies: [], bombs: [],
    spawned: new Set(), lastTime: 0, raf: 0,
  };

  function colAt(worldX) {
    const len = level.columns.length;
    const idx = ((Math.floor(worldX / COL_W) % len) + len) % len;
    return level.columns[idx];
  }
  function groundYAt(worldX) {
    return colAt(worldX).groundY;
  }

  function spawnFormation(spawn) {
    const baseGround = groundYAt(spawn.x) ?? 80;
    for (let r = 0; r < spawn.rows; r++) {
      for (let c = 0; c < spawn.cols; c++) {
        s.enemies.push({
          x: spawn.x + c * 18,
          y: baseGround - 60 - r * 16,
          ox: spawn.x + c * 18,
          dir: 1,
          phase: Math.random() * Math.PI * 2,
          alive: true,
        });
      }
    }
  }

  function score() {
    return Math.floor(s.dist / COL_W) + s.kills * KILL_POINTS;
  }
  function die() {
    if (s.dead) return;
    s.dead = true;
    onGameOver(score(), Math.floor(s.dist / COL_W), s.kills);
  }

  function update(dt, time) {
    for (const sp of level.spawns) {
      if (!s.spawned.has(sp.x) && sp.x < s.camX + VW + 40 && sp.x > s.camX - 40) {
        s.spawned.add(sp.x);
        spawnFormation(sp);
      }
    }

    if (keys.ArrowLeft) {
      s.vx -= ACC;
      s.facing = -1;
    }
    if (keys.ArrowRight) {
      s.vx += ACC;
      s.facing = 1;
    }
    if (!keys.ArrowLeft && !keys.ArrowRight) s.vx *= FRICTION;
    s.vx = Math.max(-MAX_VX, Math.min(MAX_VX, s.vx));
    s.px += s.vx;

    if (jumpEdge && s.onGround) {
      s.vy = JUMP;
      s.onGround = false;
    }
    jumpEdge = false;
    s.vy += G;
    s.py += s.vy;

    const footX = s.px + PLAYER_W / 2;
    const gY = groundYAt(footX);
    const col = colAt(footX);
    s.onGround = false;
    if (gY !== null && s.py + PLAYER_H >= gY && s.vy >= 0) {
      s.py = gY - PLAYER_H;
      s.vy = 0;
      s.onGround = true;
    }
    if (col.platformY !== null && s.vy >= 0) {
      const pY = col.platformY;
      if (s.py + PLAYER_H >= pY && s.py + PLAYER_H <= pY + 8) {
        s.py = pY - PLAYER_H;
        s.vy = 0;
        s.onGround = true;
      }
    }

    if (s.px >= level.widthPx) {
      s.px -= level.widthPx;
      s.spawned.clear();
    }
    if (s.px < 0) s.px += level.widthPx;

    if (s.py > VH + 20) return die();

    s.dist = Math.min(level.widthPx, Math.max(s.dist, s.px));
    s.camX = s.px - VW * 0.35;

    s.shootCd -= dt;
    if ((keys.x || keys.X) && s.shootCd <= 0) {
      s.shootCd = SHOOT_COOLDOWN;
      s.bullets.push({ x: s.px + PLAYER_W / 2, y: s.py + 5, vx: s.facing * BULLET_SPEED });
    }
    s.bullets.forEach((b) => (b.x += b.vx));
    s.bullets = s.bullets.filter((b) => b.x > s.camX - 20 && b.x < s.camX + VW + 20);

    for (const en of s.enemies) {
      if (!en.alive) continue;
      en.x += en.dir * (0.4 + Math.sin(time * 0.001 + en.phase) * 0.3);
      en.y += 0.05;
      if (Math.abs(en.x - en.ox) > 26) en.dir *= -1;
      if (Math.random() < 0.002) s.bombs.push({ x: en.x, y: en.y, vy: 1.2 });
    }
    s.bombs.forEach((bo) => (bo.y += bo.vy));
    s.bombs = s.bombs.filter((bo) => bo.y < VH + 10);

    for (const b of s.bullets) {
      for (const en of s.enemies) {
        if (en.alive && Math.abs(en.x + 6 - b.x) < 8 && Math.abs(en.y + 6 - b.y) < 8) {
          en.alive = false;
          b.x = -9999;
          s.kills++;
        }
      }
    }
    s.enemies = s.enemies.filter((en) => en.alive && en.y < VH + 20);

    const psx = s.px - s.camX;
    for (const en of s.enemies) {
      if (!en.alive) continue;
      const esx = en.x - s.camX;
      if (
        Math.abs(esx + 6 - (psx + PLAYER_W / 2)) < 9 &&
        Math.abs(en.y + 6 - (s.py + PLAYER_H / 2)) < 10
      ) {
        if (s.vy > 1 && s.py + PLAYER_H < en.y + 10) {
          en.alive = false;
          s.kills++;
          s.vy = JUMP * 0.6;
        } else {
          return die();
        }
      }
    }
    for (const bo of s.bombs) {
      if (
        Math.abs(bo.x - (s.px + PLAYER_W / 2)) < 8 &&
        Math.abs(bo.y - (s.py + PLAYER_H / 2)) < 9
      )
        return die();
    }
  }

  function drawSky() {
    const { bass, mid, treble } = getBands();
    const grad = ctx.createLinearGradient(0, 0, 0, VH);
    grad.addColorStop(0, `hsl(${220 - bass * 40}, 60%, ${8 + mid * 14}%)`);
    grad.addColorStop(1, `hsl(${260 - mid * 50}, 55%, ${18 + bass * 18}%)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = `rgba(255,255,255,${0.12 + treble * 0.25})`;
    for (const c of clouds) {
      c.x -= c.spd * (1 + bass * 2);
      if (c.x < -40) c.x = VW + 20;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 26 * c.s * (1 + treble * 0.4), 9 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawTerrain() {
    const startCol = Math.floor(s.camX / COL_W) - 1;
    const len = level.columns.length;
    for (let i = 0; i <= VW / COL_W + 2; i++) {
      const worldCol = startCol + i;
      const col = level.columns[((worldCol % len) + len) % len];
      const sx = worldCol * COL_W - s.camX;
      if (col.groundY !== null) {
        ctx.fillStyle = "#2e6b3a";
        ctx.fillRect(sx, col.groundY, COL_W, 4);
        ctx.fillStyle = "#1f3b22";
        ctx.fillRect(sx, col.groundY + 4, COL_W, VH - col.groundY);
      }
      if (col.platformY !== null) {
        ctx.fillStyle = "#b5651d";
        ctx.fillRect(sx, col.platformY, COL_W, 4);
      }
    }
  }

  function drawEntities() {
    ctx.fillStyle = "#ffe861";
    for (const b of s.bullets) ctx.fillRect(b.x - s.camX, b.y, 3, 2);
    for (const en of s.enemies) {
      const ex = en.x - s.camX;
      ctx.fillStyle = "#48d858";
      ctx.fillRect(ex, en.y, 12, 12);
      ctx.fillStyle = "#0a280a";
      ctx.fillRect(ex + 2, en.y + 4, 2, 2);
      ctx.fillRect(ex + 8, en.y + 4, 2, 2);
    }
    ctx.fillStyle = "#ff5050";
    for (const bo of s.bombs) ctx.fillRect(bo.x - s.camX, bo.y, 3, 4);
    const psx = s.px - s.camX;
    ctx.fillStyle = "#e8c848";
    ctx.fillRect(psx, s.py, PLAYER_W, PLAYER_H);
    ctx.fillStyle = "#58a8d8";
    ctx.fillRect(psx + (s.facing > 0 ? 7 : 1), s.py + 2, 4, 3);
  }

  function drawHud() {
    ctx.fillStyle = "#fff";
    ctx.font = "8px monospace";
    ctx.fillText(`SCORE ${score()}`, 6, 12);
  }

  function frame(time) {
    s.raf = requestAnimationFrame(frame);
    const dt = s.lastTime ? Math.min((time - s.lastTime) / 1000, 0.05) : 0.016;
    s.lastTime = time;
    if (!s.dead) update(dt, time);
    drawSky();
    drawTerrain();
    drawEntities();
    drawHud();
  }
  s.raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (s.raf) cancelAnimationFrame(s.raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.parentNode?.removeChild(canvas);
    },
  };
}
