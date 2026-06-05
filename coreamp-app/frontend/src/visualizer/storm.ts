// @ts-nocheck
// Ported from the legacy CoreAmp three.js "Storm" reactive visualizer.
import { cloudDensity } from "./cloudTexture";

let state: any = null;
let containerEl: HTMLElement | null = null;
let bassVelocity = 0;

    // Procedural fBm cloud: per-pixel noise density (radial-masked so the sprite
    // edges feather out) painted as a soft blue-white puff. Far wispier and more
    // natural than the old stacked radial gradients.
    function generateCloudTexture(THREE) {
      const size = 128;
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      const cx = c.getContext("2d");
      const img = cx.createImageData(size, size);
      const seed = Math.floor(Math.random() * 100000);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const a = cloudDensity(x / size, y / size, seed);
          const i = (y * size + x) * 4;
          img.data[i] = 225;
          img.data[i + 1] = 230;
          img.data[i + 2] = 245;
          // Gamma the alpha so thin density reads as wisps, not a flat disc.
          img.data[i + 3] = Math.round(Math.pow(a, 1.3) * 255);
        }
      }
      cx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      return tex;
    }

    function initStormVisualizer() {
      if (state) return;
      if (!window.THREE) return;
      try {
        const THREE = window.THREE;
        const container = containerEl;
        const w = container.clientWidth || 400;
        const h = container.clientHeight || 300;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x050510, 1);
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x0a0a1a, 0.0015);
        const camera = new THREE.PerspectiveCamera(60, w / h, 1, 1500);
        camera.position.set(0, 0, 300);
        camera.lookAt(0, 0, 0);

        // ── Lighting ──
        const ambient = new THREE.AmbientLight(0x333355, 0.8);
        scene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0x556688, 0.3);
        dirLight.position.set(0, 100, 200);
        scene.add(dirLight);

        // ── Lightning flash light ──
        const flashLight = new THREE.PointLight(0x7799ff, 0, 1200, 1.5);
        flashLight.position.set(0, 250, -100);
        scene.add(flashLight);

        // ── Cloud planes — textured flat meshes at different heights/depths ──
        const cloudPlaneGeo = new THREE.PlaneGeometry(600, 600);
        const clouds = [];
        const cloudTextures = [];
        for (let i = 0; i < 55; i++) {
          const tex = generateCloudTexture(THREE);
          cloudTextures.push(tex);
          const mat = new THREE.MeshLambertMaterial({
            map: tex,
            transparent: true,
            opacity: 0.45 + Math.random() * 0.35,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(cloudPlaneGeo, mat);
          mesh.position.set(
            (Math.random() - 0.5) * 600,
            200 + Math.random() * 250,
            (Math.random() - 0.5) * 600 - 80
          );
          mesh.rotation.x = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
          mesh.rotation.z = Math.random() * Math.PI * 2;
          scene.add(mesh);
          clouds.push({
            mesh, mat,
            baseY: mesh.position.y,
            rotSpeed: (Math.random() - 0.5) * 0.002,
            driftX: (Math.random() - 0.5) * 0.05,
            phase: Math.random() * Math.PI * 2,
          });
        }

        // ── Rain particles ──
        const rainCount = 1500;
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(rainCount * 3);
        const rainVel = new Float32Array(rainCount);
        for (let i = 0; i < rainCount; i++) {
          rainPos[i * 3] = (Math.random() - 0.5) * 600;
          rainPos[i * 3 + 1] = Math.random() * 500 - 100;
          rainPos[i * 3 + 2] = (Math.random() - 0.5) * 600;
          rainVel[i] = 2 + Math.random() * 3;
        }
        rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({
          color: 0x8899cc,
          size: 0.5,
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const rain = new THREE.Points(rainGeo, rainMat);
        scene.add(rain);

        // ── Lightning bolt geometry (line segments) ──
        const maxBolts = 14;
        const boltSegments = 40;
        const bolts = [];
        for (let b = 0; b < maxBolts; b++) {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(boltSegments * 3);
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.LineBasicMaterial({
            color: 0xeeffff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            linewidth: 2,
          });
          const line = new THREE.Line(geo, mat);
          line.visible = false;
          scene.add(line);
          // Glow line — thicker, dimmer duplicate for glow effect
          const glowGeo = new THREE.BufferGeometry();
          const glowPos = new Float32Array(boltSegments * 3);
          glowGeo.setAttribute("position", new THREE.BufferAttribute(glowPos, 3));
          const glowMat = new THREE.LineBasicMaterial({
            color: 0x8899ff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            linewidth: 4,
          });
          const glowLine = new THREE.Line(glowGeo, glowMat);
          glowLine.visible = false;
          scene.add(glowLine);
          // Branch bolts — more segments
          const branchGeo = new THREE.BufferGeometry();
          const branchPos = new Float32Array(18 * 3);
          branchGeo.setAttribute("position", new THREE.BufferAttribute(branchPos, 3));
          const branchMat = new THREE.LineBasicMaterial({
            color: 0xccddff, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending,
          });
          const branchLine = new THREE.Line(branchGeo, branchMat);
          branchLine.visible = false;
          scene.add(branchLine);
          // Second branch
          const branch2Geo = new THREE.BufferGeometry();
          const branch2Pos = new Float32Array(14 * 3);
          branch2Geo.setAttribute("position", new THREE.BufferAttribute(branch2Pos, 3));
          const branch2Mat = new THREE.LineBasicMaterial({
            color: 0xaabbee, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending,
          });
          const branch2Line = new THREE.Line(branch2Geo, branch2Mat);
          branch2Line.visible = false;
          scene.add(branch2Line);
          bolts.push({
            geo, pos, mat, line,
            glowGeo, glowPos, glowMat, glowLine,
            branchGeo, branchPos, branchMat, branchLine,
            branch2Geo, branch2Pos, branch2Mat, branch2Line,
            life: 0, maxLife: 0,
          });
        }
        // Full-screen flash plane behind camera
        const flashPlaneGeo = new THREE.PlaneGeometry(2000, 2000);
        const flashPlaneMat = new THREE.MeshBasicMaterial({
          color: 0xddeeff, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          depthWrite: false,
        });
        const flashPlane = new THREE.Mesh(flashPlaneGeo, flashPlaneMat);
        flashPlane.position.set(0, 200, -200);
        scene.add(flashPlane);

        const ro = new ResizeObserver(() => {
          const cw = container.clientWidth;
          const ch = container.clientHeight;
          if (cw && ch) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
          }
        });
        ro.observe(container);

        state = {
          scene, camera, renderer, ro,
          ambient, dirLight, flashLight,
          flashPlane, flashPlaneMat, flashPlaneGeo,
          clouds, cloudPlaneGeo, cloudTextures,
          rain, rainGeo, rainPos, rainVel, rainMat, rainCount,
          bolts, boltSegments, maxBolts,
          boltCooldown: 0, flashDecay: 0, screenFlash: 0,
          smoothBass: 0, smoothMid: 0, smoothTreble: 0,
          camAngle: 0,
          mode: "storm",
        };
      } catch (error) {
        console.error("Storm init failed", error);
        state = null;
      }
    }

    function destroyStormVisualizer() {
      if (!state) return;
      try {
        state.ro.disconnect();
        state.renderer.dispose();
        state.cloudPlaneGeo.dispose();
        state.cloudTextures.forEach(t => t.dispose());
        state.clouds.forEach(c => c.mat.dispose());
        state.rainGeo.dispose();
        state.rainMat.dispose();
        state.flashPlaneGeo.dispose();
        state.flashPlaneMat.dispose();
        state.bolts.forEach(b => {
          b.geo.dispose(); b.mat.dispose();
          b.glowGeo.dispose(); b.glowMat.dispose();
          b.branchGeo.dispose(); b.branchMat.dispose();
          b.branch2Geo.dispose(); b.branch2Mat.dispose();
        });
        if (state.renderer.domElement.parentNode) {
          state.renderer.domElement.parentNode.removeChild(state.renderer.domElement);
        }
      } catch (_) {}
      state = null;
    }

    function spawnBolt(s) {
      let slot = null;
      for (const b of s.bolts) { if (b.life <= 0) { slot = b; break; } }
      if (!slot) return;

      const startX = (Math.random() - 0.5) * 400;
      const startZ = (Math.random() - 0.5) * 400 - 50;
      const startY = 350 + Math.random() * 100;
      let x = startX, y = startY, z = startZ;

      // Main bolt — jagged, powerful
      for (let i = 0; i < s.boltSegments; i++) {
        const idx = i * 3;
        slot.pos[idx] = x;
        slot.pos[idx + 1] = y;
        slot.pos[idx + 2] = z;
        slot.glowPos[idx] = x;
        slot.glowPos[idx + 1] = y;
        slot.glowPos[idx + 2] = z;
        x += (Math.random() - 0.5) * 40;
        y -= (10 + Math.random() * 16);
        z += (Math.random() - 0.5) * 20;
      }
      slot.geo.attributes.position.needsUpdate = true;
      slot.glowGeo.attributes.position.needsUpdate = true;

      // Branch 1 from ~40%
      const midIdx = Math.floor(s.boltSegments * 0.35) * 3;
      let bx = slot.pos[midIdx], by = slot.pos[midIdx+1], bz = slot.pos[midIdx+2];
      for (let i = 0; i < 18; i++) {
        slot.branchPos[i*3] = bx; slot.branchPos[i*3+1] = by; slot.branchPos[i*3+2] = bz;
        bx += (Math.random() - 0.3) * 30;
        by -= (7 + Math.random() * 12);
        bz += (Math.random() - 0.5) * 15;
      }
      slot.branchGeo.attributes.position.needsUpdate = true;

      // Branch 2 from ~65%
      const mid2Idx = Math.floor(s.boltSegments * 0.65) * 3;
      let b2x = slot.pos[mid2Idx], b2y = slot.pos[mid2Idx+1], b2z = slot.pos[mid2Idx+2];
      for (let i = 0; i < 14; i++) {
        slot.branch2Pos[i*3] = b2x; slot.branch2Pos[i*3+1] = b2y; slot.branch2Pos[i*3+2] = b2z;
        b2x += (Math.random() - 0.7) * 28;
        b2y -= (6 + Math.random() * 10);
        b2z += (Math.random() - 0.5) * 12;
      }
      slot.branch2Geo.attributes.position.needsUpdate = true;

      slot.life = 1.0;
      slot.maxLife = 0.25 + Math.random() * 0.3;
      slot.line.visible = true;
      slot.glowLine.visible = true;
      slot.branchLine.visible = true;
      slot.branch2Line.visible = true;
      slot.mat.opacity = 1.0;
      slot.glowMat.opacity = 0.6;
      slot.branchMat.opacity = 0.8;
      slot.branch2Mat.opacity = 0.6;

      // Massive flash
      s.flashLight.position.set(startX, startY - 80, startZ);
      s.flashLight.power = 1500 + Math.random() * 1000;
      s.flashDecay = 1.0;
      s.screenFlash = 1.0;
    }

    function tickStormVisualizer(bass, mid, treble, time) {
      if (!state || state.mode !== "storm") return;
      const s = state;
      const t = time * 0.001;
      const dt = 0.016;

      s.smoothBass += (bass - s.smoothBass) * (bass > s.smoothBass ? 0.25 : 0.08);
      s.smoothMid += (mid - s.smoothMid) * 0.15;
      s.smoothTreble += (treble - s.smoothTreble) * 0.2;

      // ── Camera: slow orbit, bass makes it look upward ──
      s.camAngle += 0.0005 + s.smoothMid * 0.001;
      const camR = 300 - s.smoothBass * 40;
      s.camera.position.x = Math.sin(s.camAngle) * camR;
      s.camera.position.z = Math.cos(s.camAngle) * camR;
      s.camera.position.y = 10 + s.smoothBass * 60 + Math.sin(t * 0.15) * 20;
      s.camera.lookAt(0, 200 + s.smoothBass * 80, 0);

      // ── Clouds — rotate, drift, breathe with bass ──
      for (const cloud of s.clouds) {
        cloud.mesh.rotation.z += cloud.rotSpeed + s.smoothMid * 0.001;
        cloud.mesh.position.x += cloud.driftX * (1 + s.smoothBass);
        cloud.mesh.position.y = cloud.baseY + Math.sin(t * 0.2 + cloud.phase) * 10
          + s.smoothBass * 30 * Math.sin(cloud.phase);

        // Wrap clouds that drift too far
        if (cloud.mesh.position.x > 400) cloud.mesh.position.x = -400;
        if (cloud.mesh.position.x < -400) cloud.mesh.position.x = 400;

        // Illuminate on flash — dramatically
        const baseOpacity = 0.3 + s.smoothBass * 0.15;
        cloud.mat.opacity = baseOpacity + s.flashDecay * 0.6 + s.screenFlash * 0.3;
      }

      // ── Ambient light shifts with music ──
      const ambHue = (0.6 + s.smoothMid * 0.1 + t * 0.01) % 1;
      s.ambient.color.setHSL(ambHue, 0.3, 0.15 + s.smoothBass * 0.1);
      s.ambient.intensity = 0.5 + s.smoothBass * 0.5 + s.flashDecay * 2;

      // ── Rain ──
      const rPos = s.rainGeo.attributes.position.array;
      const rainSpeed = 1 + s.smoothBass * 3;
      for (let i = 0; i < s.rainCount; i++) {
        const idx = i * 3;
        rPos[idx + 1] -= s.rainVel[i] * rainSpeed;
        if (rPos[idx + 1] < -100) {
          rPos[idx + 1] = 400 + Math.random() * 100;
          rPos[idx] = (Math.random() - 0.5) * 600;
          rPos[idx + 2] = (Math.random() - 0.5) * 600;
        }
      }
      s.rainGeo.attributes.position.needsUpdate = true;
      s.rainMat.opacity = 0.2 + s.smoothMid * 0.3;
      s.rainMat.size = 0.3 + s.smoothBass * 0.4;

      // ── Lightning — bass triggers, extremely aggressive ──
      const bassVelocity = bass - s.smoothBass;
      s.boltCooldown = Math.max(0, s.boltCooldown - dt);
      if (bassVelocity > 0.02 && s.smoothBass > 0.1 && s.boltCooldown <= 0) {
        spawnBolt(s);
        // Multi-bolt volleys on any decent hit
        if (bassVelocity > 0.05) {
          setTimeout(() => { if (state === s) spawnBolt(s); }, 20 + Math.random() * 40);
          setTimeout(() => { if (state === s) spawnBolt(s); }, 50 + Math.random() * 50);
        }
        // Triple+ volleys on strong bass
        if (bassVelocity > 0.1) {
          setTimeout(() => { if (state === s) spawnBolt(s); }, 80 + Math.random() * 60);
          setTimeout(() => { if (state === s) spawnBolt(s); }, 120 + Math.random() * 80);
        }
        s.boltCooldown = 0.06 + Math.random() * 0.1;
      }
      // Constant ambient lightning — always something crackling
      if (Math.random() > 0.96) {
        spawnBolt(s);
      }
      // Random ambient flashes — very frequent
      if (Math.random() > 0.97 && s.smoothBass > 0.05) {
        s.flashLight.position.set((Math.random()-0.5)*500, 200+Math.random()*200, (Math.random()-0.5)*400);
        s.flashLight.power = 400 + Math.random() * 800;
        s.flashDecay = Math.max(s.flashDecay, 0.7);
        s.screenFlash = Math.max(s.screenFlash, 0.5);
      }

      for (const bolt of s.bolts) {
        if (bolt.life > 0) {
          bolt.life -= dt / bolt.maxLife;
          if (bolt.life <= 0) {
            bolt.line.visible = false;
            bolt.glowLine.visible = false;
            bolt.branchLine.visible = false;
            bolt.branch2Line.visible = false;
            bolt.mat.opacity = 0;
            bolt.glowMat.opacity = 0;
            bolt.branchMat.opacity = 0;
            bolt.branch2Mat.opacity = 0;
          } else {
            // Aggressive strobe flicker
            const strobe = bolt.life > 0.6 ? 1.0 :
              (bolt.life > 0.3 ? (Math.random() > 0.2 ? 1.0 : 0) :
              (Math.random() > 0.4 ? bolt.life * 3 : 0));
            bolt.mat.opacity = strobe;
            bolt.glowMat.opacity = strobe * 0.5;
            bolt.branchMat.opacity = strobe * 0.7;
            bolt.branch2Mat.opacity = strobe * 0.5;
            // Color shift — brighter white at peak
            if (strobe > 0.8) {
              bolt.mat.color.setHex(0xffffff);
              bolt.glowMat.color.setHex(0xaabbff);
            } else {
              bolt.mat.color.setHex(0xeeffff);
              bolt.glowMat.color.setHex(0x8899ff);
            }
          }
        }
      }

      // Flash decay — slower for more drama
      s.flashDecay = Math.max(0, s.flashDecay - 0.02);
      s.flashLight.power = s.flashDecay * 2000;
      // Screen flash overlay — brighter, slower decay
      s.screenFlash = Math.max(0, s.screenFlash - 0.018);
      s.flashPlaneMat.opacity = s.screenFlash * 0.5;
      s.flashPlane.lookAt(s.camera.position);

      // ── Render ──
      s.renderer.render(s.scene, s.camera);
    }

export function createStorm(container: HTMLElement, getBands: () => { bass: number; mid: number; treble: number }) {
  containerEl = container;
  initStormVisualizer();
  let raf = 0; let prevBass = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const { bass, mid, treble } = getBands();
    bassVelocity = Math.max(0, bass - prevBass); prevBass = bass;
    tickStormVisualizer(bass, mid, treble, t);
  };
  raf = requestAnimationFrame(loop);
  return { destroy() { if (raf) cancelAnimationFrame(raf); destroyStormVisualizer(); } };
}
