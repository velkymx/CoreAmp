// @ts-nocheck
// Ported verbatim from the legacy CoreAmp "Astro Chicken" game visualizer:
// a music-powered 8-bit endless runner. Arrow keys / space to play.
let gameState: any = null;
let containerEl: HTMLElement | null = null;

    const GAME_W = 320, GAME_H = 180;

    // Procedural sprite data (1=body,2=helmet,3=cannon,4=eye,5=leg,6=beak,7=jetpack)
    const CHICKEN_RUN1 = [
      "..222.....",
      ".22222....",
      ".224222...",
      ".222622...",
      ".111111...",
      ".1117111..",
      "3331111...",
      ".111111...",
      "..1..1....",
      "..5..5....",
      "..55.55...",
    ];
    const CHICKEN_RUN2 = [
      "..222.....",
      ".22222....",
      ".224222...",
      ".222622...",
      ".111111...",
      ".1117111..",
      "3331111...",
      ".111111...",
      "..1..1....",
      ".5....5...",
      ".55...55..",
    ];
    const CHICKEN_JUMP = [
      "..222.....",
      ".22222....",
      ".224222...",
      ".222622...",
      ".111111...",
      ".1117111..",
      "3331111...",
      ".111111...",
      ".5....5...",
      "55....55..",
    ];
    const CHICKEN_DUCK = [
      ".222......",
      "22222.....",
      "224222....",
      "222622....",
      "11111111..",
      "11171111..",
      "3331111...",
      ".55..55...",
    ];
    const CHICKEN_SHOOT = [
      "..222.....",
      ".22222....",
      ".224222...",
      ".222622...",
      ".111111...",
      ".1117111..",
      "33311113..",
      ".111111...",
      "..1..1....",
      "..5..5....",
      "..55.55...",
    ];

    const ENEMY_BLOB1 = [
      "..8888..",
      ".888888.",
      "88988988",
      "88888888",
      "8A8888A8",
      "88888888",
      ".888888.",
      "..8..8..",
    ];
    const ENEMY_BLOB2 = [
      "..8888..",
      ".888888.",
      "88988988",
      "88888888",
      "8A8888A8",
      "88888888",
      ".888888.",
      ".8....8.",
    ];

    const SPRITE_PALETTE = {
      "1": "#e8c848", // chicken body (gold)
      "2": "#58a8d8", // helmet (cyan)
      "3": "#d83838", // cannon (red)
      "4": "#ffffff", // eye
      "5": "#d87828", // legs (orange)
      "6": "#d85838", // beak
      "7": "#3888c8", // jetpack
      "8": "#48d858", // enemy body (green)
      "9": "#ffffff", // enemy eye
      "A": "#183818", // enemy pupil
    };

    function renderSprite(ctx, spriteData, x, y, palette, flash) {
      for (let row = 0; row < spriteData.length; row++) {
        for (let col = 0; col < spriteData[row].length; col++) {
          const ch = spriteData[row][col];
          if (ch === ".") continue;
          ctx.fillStyle = flash ? "#fff" : (palette[ch] || "#ff00ff");
          ctx.fillRect(Math.floor(x + col), Math.floor(y + row), 1, 1);
        }
      }
    }

    // 8-bit font (5x5 glyphs for 0-9, A-Z, space, !, :)
    const PIXEL_FONT = {};
    "0:01110,10001,10001,10001,01110;1:00100,01100,00100,00100,01110;2:01110,10001,00110,01000,11111;3:11110,00001,00110,00001,11110;4:10010,10010,11111,00010,00010;5:11111,10000,11110,00001,11110;6:01110,10000,11110,10001,01110;7:11111,00010,00100,01000,01000;8:01110,10001,01110,10001,01110;9:01110,10001,01111,00001,01110;A:01110,10001,11111,10001,10001;C:01110,10000,10000,10000,01110;E:11111,10000,11110,10000,11111;G:01110,10000,10011,10001,01110;H:10001,10001,11111,10001,10001;I:01110,00100,00100,00100,01110;K:10010,10100,11000,10100,10010;L:10000,10000,10000,10000,11111;M:10001,11011,10101,10001,10001;N:10001,11001,10101,10011,10001;O:01110,10001,10001,10001,01110;P:11110,10001,11110,10000,10000;R:11110,10001,11110,10010,10001;S:01111,10000,01110,00001,11110;T:11111,00100,00100,00100,00100;U:10001,10001,10001,10001,01110;V:10001,10001,10001,01010,00100;W:10001,10001,10101,11011,10001;X:10001,01010,00100,01010,10001;Y:10001,01010,00100,00100,00100; :00000,00000,00000,00000,00000;!:00100,00100,00100,00000,00100;::00000,00100,00000,00100,00000;D:11100,10010,10001,10010,11100;B:11110,10001,11110,10001,11110;F:11111,10000,11110,10000,10000;J:00111,00010,00010,10010,01100;Q:01110,10001,10101,10011,01111;Z:11111,00010,00100,01000,11111".split(";").forEach(entry => {
      const [ch, rows] = entry.split(":");
      PIXEL_FONT[ch] = rows.split(",");
    });

    function drawText(ctx, text, x, y, color, scale) {
      ctx.fillStyle = color || "#fff";
      const sc = scale || 1;
      let cx = x;
      for (const ch of text.toUpperCase()) {
        const glyph = PIXEL_FONT[ch];
        if (!glyph) { cx += 6 * sc; continue; }
        for (let r = 0; r < glyph.length; r++) {
          for (let c = 0; c < glyph[r].length; c++) {
            if (glyph[r][c] === "1") {
              ctx.fillRect(cx + c * sc, y + r * sc, sc, sc);
            }
          }
        }
        cx += 6 * sc;
      }
    }

    // Color palette cycling — world mood shifts through the song
    const WORLD_PALETTES = [
      { sky1: [8,8,32], sky2: [20,15,50], mount: [15,20,40], ground: [30,25,20], name: "midnight" },
      { sky1: [50,10,30], sky2: [80,20,50], mount: [40,15,35], ground: [45,20,25], name: "crimson" },
      { sky1: [10,25,50], sky2: [15,40,70], mount: [10,30,50], ground: [20,35,30], name: "deep ocean" },
      { sky1: [30,10,50], sky2: [50,15,70], mount: [25,15,45], ground: [35,20,30], name: "synthwave" },
      { sky1: [5,30,25], sky2: [10,50,40], mount: [8,35,30], ground: [15,40,20], name: "toxic" },
    ];

    function lerpColor(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    function rgbStr(c) { return `rgb(${Math.floor(c[0])},${Math.floor(c[1])},${Math.floor(c[2])})`; }

    function initGameVisualizer() {
      if (gameState) return;
      try {
        const container = containerEl;
        const canvas = document.createElement("canvas");
        canvas.width = GAME_W;
        canvas.height = GAME_H;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.imageRendering = "pixelated";
        canvas.style.imageRendering = "crisp-edges";
        container.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;

        // Stars
        const stars = [];
        for (let i = 0; i < 80; i++) {
          stars.push({
            x: Math.random() * GAME_W, y: Math.random() * (GAME_H * 0.6),
            size: Math.random() < 0.3 ? 2 : 1,
            speed: 0.1 + Math.random() * 0.3,
            twinklePhase: Math.random() * Math.PI * 2,
          });
        }

        // Mountains — two layers
        const mountains1 = []; // far
        const mountains2 = []; // near
        for (let i = 0; i < 20; i++) {
          mountains1.push({ x: i * 40, h: 20 + Math.random() * 25, w: 30 + Math.random() * 20 });
          mountains2.push({ x: i * 30, h: 15 + Math.random() * 20, w: 25 + Math.random() * 15 });
        }

        // Terrain segments
        const terrain = [];
        const GROUND_Y = 150;
        for (let i = 0; i < 80; i++) {
          terrain.push({ x: i * 5, y: GROUND_Y, gap: false, height: 0 });
        }

        // Key state
        const keys = {};
        const onKeyDown = (e) => {
          if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," "].includes(e.key)) {
            e.preventDefault();
            keys[e.key] = true;
          }
        };
        const onKeyUp = (e) => { keys[e.key] = false; };
        window.addEventListener("keydown", onKeyDown);
        window.addEventListener("keyup", onKeyUp);

        const ro = new ResizeObserver(() => {
          // Canvas internal resolution stays fixed; CSS scales it
        });
        ro.observe(container);

        gameState = {
          canvas, ctx, ro, keys, onKeyDown, onKeyUp,
          // Player
          px: 50, py: GROUND_Y - 12, pvx: 0, pvy: 0, grounded: true,
          ducking: false, shooting: 0, dead: false, deadTimer: 0,
          flashTimer: 0, animFrame: 0, animTimer: 0,
          runFrame: 0,
          // World
          stars, mountains1, mountains2, terrain,
          scrollX: 0, scrollSpeed: 1.5, GROUND_Y,
          enemies: [], projectiles: [], explosions: [],
          // Scoring
          score: 0, distance: 0, gameOver: false, gameOverTimer: 0,
          // Music state
          smoothBass: 0, smoothMid: 0, smoothTreble: 0,
          prevBass: 0, beatAccum: 0,
          palettePhase: 0, paletteIndex: 0,
          screenShake: 0, energyAccum: 0,
          shootCooldown: 0,
          spawnTimer: 0,
          // Shooting stars
          shootingStars: [],
          // Ground cracks
          cracks: [],
          // Dust particles
          dust: [],
          // CRT effect intensity
          crtIntensity: 0,
          // Pulse ring on big beats
          pulseRings: [],
          lastTime: 0,
          mode: "game",
        };
      } catch (error) {
        console.error("Game init failed", error);
        gameState = null;
      }
    }

    function destroyGameVisualizer() {
      if (!gameState) return;
      try {
        window.removeEventListener("keydown", gameState.onKeyDown);
        window.removeEventListener("keyup", gameState.onKeyUp);
        gameState.ro.disconnect();
        if (gameState.canvas.parentNode) {
          gameState.canvas.parentNode.removeChild(gameState.canvas);
        }
      } catch (_) {}
      gameState = null;
    }

    function tickGameVisualizer(bass, mid, treble, time) {
      if (!gameState || gameState.mode !== "game") return;
      const s = gameState;
      const ctx = s.ctx;
      const dt = s.lastTime ? Math.min((time - s.lastTime) / 1000, 0.05) : 0.016;
      s.lastTime = time;

      // ── Smooth audio ──
      s.prevBass = s.smoothBass;
      s.smoothBass += (bass - s.smoothBass) * (bass > s.smoothBass ? 0.3 : 0.08);
      s.smoothMid += (mid - s.smoothMid) * 0.15;
      s.smoothTreble += (treble - s.smoothTreble) * 0.25;
      const bassHit = s.smoothBass - s.prevBass;
      s.energyAccum += (bass + mid + treble) / 3 * dt;

      // ── Palette cycling — world mood shifts mostly with the music energy ──
      s.palettePhase += dt * 0.01 + (s.smoothBass + s.smoothMid) * dt * 0.7;
      const palLen = WORLD_PALETTES.length;
      const palFloat = (s.palettePhase * 0.5) % palLen;
      const palA = WORLD_PALETTES[Math.floor(palFloat) % palLen];
      const palB = WORLD_PALETTES[(Math.floor(palFloat) + 1) % palLen];
      const palT = palFloat % 1;
      const sky1 = lerpColor(palA.sky1, palB.sky1, palT);
      const sky2 = lerpColor(palA.sky2, palB.sky2, palT);
      const mountColor = lerpColor(palA.mount, palB.mount, palT);
      const groundColor = lerpColor(palA.ground, palB.ground, palT);

      // Brighten everything with energy
      const energyBright = s.smoothBass * 55 + s.smoothMid * 28;
      sky1[0] += energyBright; sky1[1] += energyBright * 0.5; sky1[2] += energyBright;
      sky2[0] += energyBright * 0.5; sky2[1] += energyBright * 0.3; sky2[2] += energyBright * 0.7;

      // ── Screen shake on bass hits ──
      if (bassHit > 0.02) {
        s.screenShake = Math.min(5, s.screenShake + bassHit * 55);
      }
      s.screenShake = Math.max(0, s.screenShake - dt * 20);

      // ── Shooting stars on treble spikes ──
      const trebleHit = Math.max(0, treble - s.smoothTreble);
      if (trebleHit > 0.05 && s.smoothTreble > 0.3 && s.shootingStars.length < 5) {
        s.shootingStars.push({
          x: GAME_W + 10, y: Math.random() * 60,
          vx: -(8 + Math.random() * 6), vy: 1 + Math.random() * 2,
          life: 1, trail: [],
        });
      }

      // ── Ground cracks on heavy bass drops ──
      if (bassHit > 0.08) {
        s.cracks.push({
          x: s.scrollX + 100 + Math.random() * GAME_W,
          life: 1.5, width: 10 + Math.random() * 20,
        });
      }

      // ── Dust kicks on beats ──
      if (bassHit > 0.03 && s.dust.length < 30) {
        const dx = s.px + Math.random() * 10 - 5;
        for (let i = 0; i < 3; i++) {
          s.dust.push({
            x: dx + Math.random() * 6, y: s.GROUND_Y - 1,
            vx: (Math.random() - 0.5) * 2, vy: -(1 + Math.random() * 2),
            life: 0.5 + Math.random() * 0.3,
          });
        }
      }

      // ── Pulse rings on big bass ──
      if (bassHit > 0.06) {
        s.pulseRings.push({ x: s.px + 6, y: s.py + 6, r: 5, maxR: 30 + bassHit * 100, life: 1 });
      }

      // ── CRT scanline intensity follows energy ──
      s.crtIntensity += ((s.smoothBass + s.smoothTreble) * 0.5 - s.crtIntensity) * 0.1;

      // ── Scroll speed — bass drives how fast you fly ──
      s.scrollSpeed = 1.5 + s.smoothBass * 3.0 + s.smoothMid * 1.0;

      if (!s.gameOver && !s.dead) {
        s.scrollX += s.scrollSpeed;
        s.distance += s.scrollSpeed * 0.1;
        s.score = Math.floor(s.distance);

        // ── Player physics ──
        const playerH = s.ducking ? 8 : 12;
        if (s.keys["ArrowUp"] && s.grounded) {
          s.pvy = -5.5;
          s.grounded = false;
          // Jump dust
          for (let i = 0; i < 4; i++) {
            s.dust.push({
              x: s.px + Math.random() * 8, y: s.GROUND_Y - 1,
              vx: (Math.random() - 0.5) * 3, vy: -(0.5 + Math.random()),
              life: 0.4,
            });
          }
        }
        s.ducking = !!s.keys["ArrowDown"] && s.grounded;
        if (!s.grounded) {
          s.pvy += 15 * dt; // gravity
          s.py += s.pvy;
          if (s.py >= s.GROUND_Y - playerH) {
            s.py = s.GROUND_Y - playerH;
            s.pvy = 0;
            s.grounded = true;
          }
        } else {
          s.py = s.GROUND_Y - playerH;
        }

        // Check if over a gap
        const playerWorldX = s.scrollX + s.px;
        let overGap = false;
        for (const seg of s.terrain) {
          if (seg.gap && playerWorldX > seg.x && playerWorldX < seg.x + 5) {
            overGap = true;
            break;
          }
        }
        if (overGap && s.grounded) {
          s.grounded = false;
          s.pvy = 0.5;
        }
        if (s.py > GAME_H + 20) {
          s.dead = true;
          s.deadTimer = 0;
        }

        // ── Shooting ──
        s.shootCooldown = Math.max(0, s.shootCooldown - dt);
        if (s.keys[" "] && s.shootCooldown <= 0) {
          s.projectiles.push({
            x: s.px + 10, y: s.py + (s.ducking ? 3 : 5),
            vx: 6,
          });
          s.shootCooldown = 0.15;
          s.shooting = 0.12;
        }
        s.shooting = Math.max(0, s.shooting - dt);

        // ── Animation ──
        s.animTimer += dt;
        if (s.animTimer > 0.12 / (0.5 + s.scrollSpeed * 0.3)) {
          s.animTimer = 0;
          s.runFrame = 1 - s.runFrame;
        }

        // ── Spawn enemies — treble drives density ──
        s.spawnTimer -= dt;
        const spawnRate = 2.0 - s.smoothTreble * 1.2 - s.smoothBass * 0.3;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = Math.max(0.4, spawnRate) + Math.random() * 0.5;
          const ey = s.GROUND_Y - 9;
          s.enemies.push({
            x: GAME_W + 5, y: ey, vx: -(0.8 + s.smoothBass * 1.5 + Math.random()),
            hp: 1, animFrame: 0, animTimer: 0,
            spawnFlash: 0.2, // teleport-in effect
          });
        }

        // ── Terrain generation ──
        const lastSeg = s.terrain[s.terrain.length - 1];
        while (lastSeg.x - s.scrollX < GAME_W + 40) {
          const nx = lastSeg.x + 5;
          const makeGap = s.smoothMid > 0.4 && Math.random() < s.smoothMid * 0.08;
          const bassWave = Math.sin(nx * 0.02 + s.energyAccum * 2) * s.smoothBass * 8;
          s.terrain.push({ x: nx, y: s.GROUND_Y + bassWave, gap: makeGap, height: bassWave });
          s.terrain[s.terrain.length - 1]; // update lastSeg ref
          break;
        }
        // Re-check and keep generating
        while (s.terrain[s.terrain.length - 1].x - s.scrollX < GAME_W + 40) {
          const last = s.terrain[s.terrain.length - 1];
          const nx = last.x + 5;
          const makeGap = s.smoothMid > 0.4 && Math.random() < s.smoothMid * 0.06;
          const bassWave = Math.sin(nx * 0.02 + s.energyAccum * 2) * s.smoothBass * 8;
          s.terrain.push({ x: nx, y: s.GROUND_Y + bassWave, gap: makeGap, height: bassWave });
        }
        // Cull old terrain
        while (s.terrain.length > 0 && s.terrain[0].x < s.scrollX - 20) {
          s.terrain.shift();
        }

        // ── Update enemies ──
        for (let i = s.enemies.length - 1; i >= 0; i--) {
          const e = s.enemies[i];
          e.x += e.vx;
          e.spawnFlash = Math.max(0, e.spawnFlash - dt);
          e.animTimer += dt;
          if (e.animTimer > 0.25) { e.animTimer = 0; e.animFrame = 1 - e.animFrame; }
          // Off screen
          if (e.x < -12) { s.enemies.splice(i, 1); continue; }
          // Collision with player
          if (!s.dead && e.spawnFlash <= 0) {
            const ph = s.ducking ? 8 : 12;
            if (e.x < s.px + 10 && e.x + 8 > s.px && e.y < s.py + ph && e.y + 8 > s.py) {
              s.dead = true;
              s.deadTimer = 0;
              s.explosions.push({ x: s.px, y: s.py, frame: 0, timer: 0 });
            }
          }
        }

        // ── Update projectiles ──
        for (let i = s.projectiles.length - 1; i >= 0; i--) {
          const p = s.projectiles[i];
          p.x += p.vx;
          if (p.x > GAME_W + 10) { s.projectiles.splice(i, 1); continue; }
          // Hit enemies
          for (let j = s.enemies.length - 1; j >= 0; j--) {
            const e = s.enemies[j];
            if (p.x > e.x && p.x < e.x + 8 && p.y > e.y && p.y < e.y + 8) {
              s.explosions.push({ x: e.x, y: e.y, frame: 0, timer: 0 });
              s.enemies.splice(j, 1);
              s.projectiles.splice(i, 1);
              s.score += 50;
              // Kill dust
              for (let d = 0; d < 5; d++) {
                s.dust.push({
                  x: e.x + 4 + (Math.random()-0.5)*6, y: e.y + 4 + (Math.random()-0.5)*6,
                  vx: (Math.random()-0.5)*4, vy: (Math.random()-0.5)*4,
                  life: 0.3 + Math.random()*0.2,
                });
              }
              break;
            }
          }
        }
      }

      // ── Dead / game over ──
      if (s.dead) {
        s.deadTimer += dt;
        if (s.deadTimer > 1.5) {
          s.gameOver = true;
        }
      }
      if (s.gameOver) {
        s.gameOverTimer += dt;
        // Restart on any key
        if (s.gameOverTimer > 0.5 && (s.keys["ArrowUp"] || s.keys[" "])) {
          // Reset
          s.px = 50; s.py = s.GROUND_Y - 12; s.pvx = 0; s.pvy = 0;
          s.grounded = true; s.ducking = false; s.dead = false;
          s.deadTimer = 0; s.gameOver = false; s.gameOverTimer = 0;
          s.score = 0; s.distance = 0; s.scrollX = 0;
          s.enemies = []; s.projectiles = []; s.explosions = [];
          s.shootingStars = []; s.cracks = []; s.dust = []; s.pulseRings = [];
          s.spawnTimer = 2; s.shooting = 0; s.flashTimer = 0;
          // Regenerate terrain
          s.terrain = [];
          for (let i = 0; i < 80; i++) {
            s.terrain.push({ x: i * 5, y: s.GROUND_Y, gap: false, height: 0 });
          }
          s.keys["ArrowUp"] = false;
          s.keys[" "] = false;
        }
      }

      // ── Update effects ──
      for (let i = s.explosions.length - 1; i >= 0; i--) {
        const ex = s.explosions[i];
        ex.timer += dt;
        if (ex.timer > 0.08) { ex.timer = 0; ex.frame++; }
        if (ex.frame > 4) s.explosions.splice(i, 1);
      }
      for (let i = s.shootingStars.length - 1; i >= 0; i--) {
        const ss = s.shootingStars[i];
        ss.trail.push({ x: ss.x, y: ss.y });
        if (ss.trail.length > 8) ss.trail.shift();
        ss.x += ss.vx;
        ss.y += ss.vy;
        ss.life -= dt * 1.5;
        if (ss.life <= 0 || ss.x < -20) s.shootingStars.splice(i, 1);
      }
      for (let i = s.cracks.length - 1; i >= 0; i--) {
        s.cracks[i].life -= dt;
        if (s.cracks[i].life <= 0) s.cracks.splice(i, 1);
      }
      for (let i = s.dust.length - 1; i >= 0; i--) {
        const d = s.dust[i];
        d.x += d.vx * dt * 60;
        d.y += d.vy * dt * 60;
        d.vy += 5 * dt;
        d.life -= dt;
        if (d.life <= 0) s.dust.splice(i, 1);
      }
      for (let i = s.pulseRings.length - 1; i >= 0; i--) {
        const pr = s.pulseRings[i];
        pr.r += (pr.maxR - pr.r) * 0.08;
        pr.life -= dt * 2;
        if (pr.life <= 0) s.pulseRings.splice(i, 1);
      }

      // ── RENDER ──
      const shakeX = s.screenShake ? (Math.random() - 0.5) * s.screenShake : 0;
      const shakeY = s.screenShake ? (Math.random() - 0.5) * s.screenShake : 0;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      // Sky gradient — palette driven by music
      const skyGrad = ctx.createLinearGradient(0, 0, 0, GAME_H * 0.7);
      skyGrad.addColorStop(0, rgbStr(sky1));
      skyGrad.addColorStop(1, rgbStr(sky2));
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, GAME_W, GAME_H);

      // ── Stars ──
      for (const star of s.stars) {
        star.x -= star.speed * s.scrollSpeed * 0.3;
        if (star.x < -2) { star.x = GAME_W + 2; star.y = Math.random() * GAME_H * 0.6; }
        const twinkle = 0.4 + Math.sin(time * 0.003 + star.twinklePhase) * 0.4 + s.smoothTreble * 0.3;
        const bright = Math.floor(150 + twinkle * 105);
        ctx.fillStyle = `rgb(${bright},${bright},${Math.min(255, bright + 30)})`;
        ctx.fillRect(Math.floor(star.x), Math.floor(star.y), star.size, star.size);
      }

      // ── Shooting stars ──
      for (const ss of s.shootingStars) {
        for (let i = 0; i < ss.trail.length; i++) {
          const a = (i / ss.trail.length) * ss.life;
          ctx.fillStyle = `rgba(200,220,255,${a})`;
          ctx.fillRect(Math.floor(ss.trail[i].x), Math.floor(ss.trail[i].y), 1, 1);
        }
        ctx.fillStyle = `rgba(255,255,255,${ss.life})`;
        ctx.fillRect(Math.floor(ss.x), Math.floor(ss.y), 2, 2);
      }

      // ── Mountains far — breathe with bass ──
      const mountBreath = 1 + s.smoothBass * 0.15;
      ctx.fillStyle = rgbStr(mountColor);
      for (const m of s.mountains1) {
        const mx = ((m.x - s.scrollX * 0.15) % (20 * 40) + 20 * 40) % (20 * 40) - 40;
        const mh = m.h * mountBreath;
        const my = GAME_H * 0.65 - mh;
        ctx.beginPath();
        ctx.moveTo(mx, GAME_H * 0.75);
        ctx.lineTo(mx + m.w * 0.5, my);
        ctx.lineTo(mx + m.w, GAME_H * 0.75);
        ctx.fill();
      }

      // Mountains near
      const nearMountColor = lerpColor(mountColor, groundColor, 0.4);
      ctx.fillStyle = rgbStr(nearMountColor);
      for (const m of s.mountains2) {
        const mx = ((m.x - s.scrollX * 0.3) % (20 * 30) + 20 * 30) % (20 * 30) - 30;
        const mh = m.h * mountBreath * 0.9;
        const my = GAME_H * 0.72 - mh;
        ctx.beginPath();
        ctx.moveTo(mx, GAME_H * 0.82);
        ctx.lineTo(mx + m.w * 0.4, my);
        ctx.lineTo(mx + m.w * 0.6, my + 3);
        ctx.lineTo(mx + m.w, GAME_H * 0.82);
        ctx.fill();
      }

      // ── Ground cracks — lava glowing beneath ──
      for (const crack of s.cracks) {
        const cx = crack.x - s.scrollX;
        if (cx < -30 || cx > GAME_W + 30) continue;
        const a = Math.min(1, crack.life);
        const glowR = 200 + Math.sin(time * 0.01) * 55;
        ctx.fillStyle = `rgba(${Math.floor(glowR)},60,20,${a * 0.6})`;
        ctx.fillRect(Math.floor(cx), s.GROUND_Y - 2, crack.width, 6);
        // Bright crack line
        ctx.fillStyle = `rgba(255,180,50,${a * 0.9})`;
        for (let i = 0; i < crack.width; i += 2 + Math.floor(Math.random()*3)) {
          ctx.fillRect(Math.floor(cx + i), s.GROUND_Y - 1 + Math.floor(Math.random()*3), 1, 1);
        }
      }

      // ── Terrain ──
      for (const seg of s.terrain) {
        const sx = seg.x - s.scrollX;
        if (sx < -10 || sx > GAME_W + 10) continue;
        if (seg.gap) continue;
        const brightShift = s.smoothBass * 20;
        const gc = [groundColor[0]+brightShift, groundColor[1]+brightShift*0.5, groundColor[2]+brightShift*0.3];
        ctx.fillStyle = rgbStr(gc);
        ctx.fillRect(Math.floor(sx), Math.floor(seg.y), 6, GAME_H - Math.floor(seg.y));
        // Surface detail
        ctx.fillStyle = rgbStr([gc[0]+15, gc[1]+15, gc[2]+10]);
        ctx.fillRect(Math.floor(sx), Math.floor(seg.y), 6, 1);
      }

      // ── Pulse rings ──
      for (const pr of s.pulseRings) {
        ctx.strokeStyle = `rgba(100,180,255,${pr.life * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(Math.floor(pr.x), Math.floor(pr.y), Math.floor(pr.r), 0, Math.PI * 2);
        ctx.stroke();
      }

      // ── Enemies ──
      for (const e of s.enemies) {
        if (e.spawnFlash > 0) {
          // Teleport-in: vertical scan lines
          ctx.fillStyle = `rgba(100,255,100,${e.spawnFlash * 3})`;
          ctx.fillRect(Math.floor(e.x + 3), Math.floor(e.y - 4), 2, 16);
        } else {
          const sprite = e.animFrame === 0 ? ENEMY_BLOB1 : ENEMY_BLOB2;
          renderSprite(ctx, sprite, e.x, e.y, SPRITE_PALETTE, false);
        }
      }

      // ── Projectiles ──
      for (const p of s.projectiles) {
        // Glow
        ctx.fillStyle = "rgba(255,200,100,0.3)";
        ctx.fillRect(Math.floor(p.x - 1), Math.floor(p.y - 1), 5, 3);
        // Bolt
        ctx.fillStyle = "#ffe060";
        ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 3, 1);
      }

      // ── Player ──
      if (!s.dead || Math.floor(s.deadTimer * 10) % 2 === 0) {
        let sprite;
        if (s.dead) sprite = CHICKEN_JUMP;
        else if (!s.grounded) sprite = CHICKEN_JUMP;
        else if (s.ducking) sprite = CHICKEN_DUCK;
        else if (s.shooting > 0) sprite = CHICKEN_SHOOT;
        else sprite = s.runFrame === 0 ? CHICKEN_RUN1 : CHICKEN_RUN2;
        renderSprite(ctx, sprite, s.px, s.py, SPRITE_PALETTE, s.dead && s.deadTimer < 0.3);
      }

      // ── Dust particles ──
      for (const d of s.dust) {
        const a = Math.min(1, d.life * 2);
        ctx.fillStyle = `rgba(200,180,140,${a})`;
        ctx.fillRect(Math.floor(d.x), Math.floor(d.y), 1, 1);
      }

      // ── Explosions ──
      for (const ex of s.explosions) {
        const r = 3 + ex.frame * 2;
        const colors = ["#fff", "#ffe060", "#ff8020", "#d83838", "#881818"];
        const c = colors[Math.min(ex.frame, colors.length - 1)];
        ctx.fillStyle = c;
        // Pixel explosion pattern
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + ex.frame * 0.3;
          const dist = r * (0.5 + Math.random() * 0.5);
          ctx.fillRect(
            Math.floor(ex.x + 4 + Math.cos(angle) * dist),
            Math.floor(ex.y + 4 + Math.sin(angle) * dist),
            2, 2
          );
        }
      }

      // ── CRT scanline overlay ──
      if (s.crtIntensity > 0.05) {
        const scanAlpha = s.crtIntensity * 0.12;
        ctx.fillStyle = `rgba(0,0,0,${scanAlpha})`;
        for (let y = 0; y < GAME_H; y += 2) {
          ctx.fillRect(0, y, GAME_W, 1);
        }
      }

      // ── HUD ──
      drawText(ctx, `SCORE:${s.score}`, 4, 4, "#fff", 1);

      // Speed indicator — more bars = faster
      const speedBars = Math.min(10, Math.floor(s.scrollSpeed * 2));
      for (let i = 0; i < speedBars; i++) {
        const barHue = i / 10;
        const r = Math.floor(100 + barHue * 155);
        const g = Math.floor(255 - barHue * 200);
        ctx.fillStyle = `rgb(${r},${g},50)`;
        ctx.fillRect(GAME_W - 14, GAME_H - 8 - i * 3, 10, 2);
      }

      // ── Game over screen ──
      if (s.gameOver) {
        // Darken
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 0, GAME_W, GAME_H);

        drawText(ctx, "GAME OVER", GAME_W / 2 - 27, GAME_H / 2 - 20, "#d83838", 2);
        drawText(ctx, `SCORE:${s.score}`, GAME_W / 2 - 30, GAME_H / 2 + 5, "#e8c848", 1);
        if (s.gameOverTimer > 0.5) {
          const blink = Math.floor(time * 0.003) % 2 === 0;
          if (blink) {
            drawText(ctx, "PRESS JUMP TO RETRY", GAME_W / 2 - 55, GAME_H / 2 + 20, "#888", 1);
          }
        }
      }

      ctx.restore();
    }

export function createAstroChicken(
  container: HTMLElement,
  getBands: () => { bass: number; mid: number; treble: number },
) {
  containerEl = container;
  initGameVisualizer();
  let raf = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const { bass, mid, treble } = getBands();
    tickGameVisualizer(bass, mid, treble, t);
  };
  raf = requestAnimationFrame(loop);
  return { destroy() { if (raf) cancelAnimationFrame(raf); destroyGameVisualizer(); } };
}
