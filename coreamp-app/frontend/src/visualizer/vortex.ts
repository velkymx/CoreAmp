// @ts-nocheck
// Ported from the legacy CoreAmp three.js "Vortex" reactive visualizer.
let state: any = null;
let containerEl: HTMLElement | null = null;
let bassVelocity = 0;

    function initVortexVisualizer() {
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
        renderer.setClearColor(0x000000, 1);
        renderer.autoClear = false;
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(65, w / h, 0.1, 120);
        camera.position.set(0, 6, 8);
        camera.lookAt(0, 0, 0);

        // Trail effect
        const trailScene = new THREE.Scene();
        const trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const trailMat = new THREE.MeshBasicMaterial({
          color: 0x000000, transparent: true, opacity: 0.06,
          blending: THREE.NormalBlending, depthTest: false,
        });
        trailScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), trailMat));

        // ── Spiral particle system ──
        const armCount = 5;
        const particlesPerArm = 1200;
        const totalParticles = armCount * particlesPerArm;
        const pGeo = new THREE.BufferGeometry();
        const pPos = new Float32Array(totalParticles * 3);
        const pColor = new Float32Array(totalParticles * 3);
        const pBaseAngle = new Float32Array(totalParticles);
        const pBaseR = new Float32Array(totalParticles);
        const pBaseY = new Float32Array(totalParticles);
        const pArm = new Float32Array(totalParticles);
        const pSpeed = new Float32Array(totalParticles);

        for (let a = 0; a < armCount; a++) {
          const armOffset = (a / armCount) * Math.PI * 2;
          for (let i = 0; i < particlesPerArm; i++) {
            const idx = a * particlesPerArm + i;
            const t = i / particlesPerArm; // 0..1 from center to edge
            const r = 0.2 + t * 6.0;
            const angle = armOffset + t * Math.PI * 3.5 + (Math.random() - 0.5) * 0.4;
            const y = (Math.random() - 0.5) * (0.15 + t * 0.6);

            pPos[idx * 3] = Math.cos(angle) * r;
            pPos[idx * 3 + 1] = y;
            pPos[idx * 3 + 2] = Math.sin(angle) * r;

            pBaseAngle[idx] = angle;
            pBaseR[idx] = r;
            pBaseY[idx] = y;
            pArm[idx] = a;
            pSpeed[idx] = 0.8 + Math.random() * 0.4; // inner = faster

            // Color: warm core → cool edges
            const hue = 0.6 + t * 0.25 + a * 0.04; // blue → purple gradient per arm
            const sat = 0.7 + (1 - t) * 0.3;
            const lum = 0.4 + (1 - t) * 0.35;
            const c = new THREE.Color().setHSL(hue % 1, sat, lum);
            pColor[idx * 3] = c.r;
            pColor[idx * 3 + 1] = c.g;
            pColor[idx * 3 + 2] = c.b;
          }
        }

        pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
        pGeo.setAttribute("color", new THREE.BufferAttribute(pColor, 3));

        const pMat = new THREE.PointsMaterial({
          size: 0.045,
          vertexColors: true,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const particles = new THREE.Points(pGeo, pMat);
        scene.add(particles);

        // ── Center glow orb ──
        const glowGeo = new THREE.SphereGeometry(0.3, 16, 16);
        const glowMat = new THREE.MeshBasicMaterial({
          color: 0x6644ff,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
        });
        const glowMesh = new THREE.Mesh(glowGeo, glowMat);
        scene.add(glowMesh);

        // Outer halo
        const haloGeo = new THREE.SphereGeometry(0.6, 16, 16);
        const haloMat = new THREE.MeshBasicMaterial({
          color: 0x4422aa,
          transparent: true,
          opacity: 0.15,
          blending: THREE.AdditiveBlending,
        });
        const haloMesh = new THREE.Mesh(haloGeo, haloMat);
        scene.add(haloMesh);

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
          trailScene, trailCamera, trailMat,
          particles, pGeo, pPos, pColor, pBaseAngle, pBaseR, pBaseY, pArm, pSpeed, pMat,
          glowMesh, glowMat, haloMesh, haloMat, glowGeo, haloGeo,
          totalParticles, particlesPerArm, armCount,
          spinOffset: 0, camAngle: 0, bloomDecay: 0,
          mode: "vortex",
        };
      } catch (error) {
        console.error("Vortex init failed", error);
        state = null;
      }
    }

    function destroyVortexVisualizer() {
      if (!state) return;
      try {
        state.ro.disconnect();
        state.renderer.dispose();
        state.pGeo.dispose();
        state.pMat.dispose();
        state.glowGeo.dispose();
        state.glowMat.dispose();
        state.haloGeo.dispose();
        state.haloMat.dispose();
        state.trailMat.dispose();
        if (state.renderer.domElement.parentNode) {
          state.renderer.domElement.parentNode.removeChild(state.renderer.domElement);
        }
      } catch (_) {}
      state = null;
    }

    function tickVortexVisualizer(bass, mid, treble, time) {
      if (!state || state.mode !== "vortex") return;
      const s = state;
      const THREE = window.THREE;
      const t = time * 0.001;

      // ── Camera: orbit above the vortex, dips on bass ──
      s.camAngle += 0.0015 + mid * 0.005;
      const camDip = 4.5 - bass * 2.5; // dives closer on bass
      const camDist = 8 + treble * 2 - bass * 2;
      s.camera.position.x = Math.sin(s.camAngle) * camDist;
      s.camera.position.z = Math.cos(s.camAngle) * camDist;
      s.camera.position.y = camDip + Math.sin(t * 0.18) * 0.8;
      s.camera.lookAt(0, 0, 0);

      // ── Bloom from bass hits ──
      if (bassVelocity > 0.03) {
        s.bloomDecay = Math.min(1.0, s.bloomDecay + bassVelocity * 5.0);
      }
      s.bloomDecay = Math.max(0, s.bloomDecay - 0.03);

      // ── Spin particles ──
      const spinSpeed = 0.3 + bass * 1.2 + s.bloomDecay * 0.8;
      s.spinOffset += spinSpeed * 0.016; // ~60fps normalized
      const positions = s.pGeo.attributes.position.array;
      const colors = s.pGeo.attributes.color.array;

      const expand = 1.0 + bass * 0.5 + s.bloomDecay * 0.6;
      const yPulse = 1.0 + mid * 1.5 + s.bloomDecay * 2.0;
      const colorTime = t * 0.15;

      for (let i = 0; i < s.totalParticles; i++) {
        const idx = i * 3;
        const baseR = s.pBaseR[i];
        const tNorm = (i % s.particlesPerArm) / s.particlesPerArm; // 0=center, 1=edge

        // Inner particles spin faster
        const localSpin = s.spinOffset * s.pSpeed[i] * (1.2 - tNorm * 0.7);
        const angle = s.pBaseAngle[i] + localSpin;
        const r = baseR * expand;

        // Radial wave — ripple from center on beats
        const wave = Math.sin(baseR * 2.5 - t * 3.0) * bass * 0.3;
        const yOff = s.pBaseY[i] * yPulse + wave;

        positions[idx] = Math.cos(angle) * r;
        positions[idx + 1] = yOff;
        positions[idx + 2] = Math.sin(angle) * r;

        // Color: shift hue with music, brighten core on beats
        const armHueOffset = s.pArm[i] * 0.08;
        const hue = (0.55 + tNorm * 0.3 + armHueOffset + colorTime + bass * 0.1) % 1;
        const sat = 0.75 + treble * 0.25;
        const lum = 0.3 + (1 - tNorm) * 0.4 + s.bloomDecay * 0.25 * (1 - tNorm);

        // Inline HSL → RGB for performance
        const c = (1 - Math.abs(2 * lum - 1)) * sat;
        const x = c * (1 - Math.abs((hue * 6) % 2 - 1));
        const m = lum - c * 0.5;
        const hh = hue * 6;
        let cr, cg, cb;
        if (hh < 1) { cr = c; cg = x; cb = 0; }
        else if (hh < 2) { cr = x; cg = c; cb = 0; }
        else if (hh < 3) { cr = 0; cg = c; cb = x; }
        else if (hh < 4) { cr = 0; cg = x; cb = c; }
        else if (hh < 5) { cr = x; cg = 0; cb = c; }
        else { cr = c; cg = 0; cb = x; }
        colors[idx] = cr + m;
        colors[idx + 1] = cg + m;
        colors[idx + 2] = cb + m;
      }
      s.pGeo.attributes.position.needsUpdate = true;
      s.pGeo.attributes.color.needsUpdate = true;

      // Particle size pulses with treble
      s.pMat.size = 0.035 + treble * 0.04 + s.bloomDecay * 0.03;
      s.pMat.opacity = 0.6 + bass * 0.3;

      // ── Center glow: throbs with bass ──
      const glowScale = 0.8 + bass * 1.5 + s.bloomDecay * 1.2;
      s.glowMesh.scale.setScalar(glowScale);
      const glowHue = (0.7 + colorTime + bass * 0.15) % 1;
      s.glowMat.color.setHSL(glowHue, 0.9, 0.5 + s.bloomDecay * 0.3);
      s.glowMat.opacity = 0.4 + bass * 0.4 + s.bloomDecay * 0.3;

      s.haloMesh.scale.setScalar(glowScale * 1.8);
      s.haloMat.color.setHSL((glowHue + 0.1) % 1, 0.7, 0.3);
      s.haloMat.opacity = 0.08 + bass * 0.15 + s.bloomDecay * 0.1;

      // ── Render with trails ──
      s.trailMat.opacity = 0.04 + (1.0 - bass) * 0.06;
      s.renderer.render(s.trailScene, s.trailCamera);
      s.renderer.render(s.scene, s.camera);
    }

    // ── Nebula reactive mode (sub-mode 2) ──


export function createVortex(container: HTMLElement, getBands: () => { bass: number; mid: number; treble: number }) {
  containerEl = container;
  initVortexVisualizer();
  let raf = 0; let prevBass = 0;
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    const { bass, mid, treble } = getBands();
    bassVelocity = Math.max(0, bass - prevBass); prevBass = bass;
    tickVortexVisualizer(bass, mid, treble, t);
  };
  raf = requestAnimationFrame(loop);
  return { destroy() { if (raf) cancelAnimationFrame(raf); destroyVortexVisualizer(); } };
}
