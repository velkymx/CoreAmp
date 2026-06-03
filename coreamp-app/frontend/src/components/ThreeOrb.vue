<template>
  <div ref="hostEl" class="three-orb">
    <div v-if="error" class="orb-msg small text-light" data-test="orb-error">{{ error }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import { loadThree } from "@/visualizer/loadVendor";
import { useFrequencyData } from "@/composables/useFrequencyData";
import { errorMessage } from "@/stores/notify";

// Ported from the legacy "Reactive" three.js orb: an icosahedron whose vertices
// breathe with bass, morph with mids/treble, wrapped in a wireframe, orbiting
// particles and a starfield, with bass-triggered bloom and treble lens flares.

const hostEl = ref<HTMLDivElement | null>(null);
const error = ref("");
const { freq } = useFrequencyData();

let state: any = null;
let raf = 0;
let prevBass = 0;
let prevTreble = 0;

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (c.getContext("webgl") || c.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

// Reduce the FFT buffer to three normalized energy bands.
function bands(): { bass: number; mid: number; treble: number } {
  const f = freq.value;
  const avg = (lo: number, hi: number): number => {
    let sum = 0;
    let n = 0;
    for (let i = lo; i < hi && i < f.length; i++) {
      sum += f[i];
      n++;
    }
    return n ? sum / n / 255 : 0;
  };
  return { bass: avg(1, 30), mid: avg(30, 200), treble: avg(200, 500) };
}

const vertexShader = `
  varying vec3 vNormal; varying vec3 vPosition; varying vec3 vWorldPosition;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPosition = wp.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const fragmentShader = `
  uniform float uBass; uniform float uMid; uniform float uTreble;
  uniform float uTime; uniform float uBloom; uniform float uBassVelocity;
  varying vec3 vNormal; varying vec3 vPosition; varying vec3 vWorldPosition;
  vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = l - c * 0.5; vec3 rgb; float hh = h * 6.0;
    if (hh < 1.0) rgb = vec3(c, x, 0.0); else if (hh < 2.0) rgb = vec3(x, c, 0.0);
    else if (hh < 3.0) rgb = vec3(0.0, c, x); else if (hh < 4.0) rgb = vec3(0.0, x, c);
    else if (hh < 5.0) rgb = vec3(x, 0.0, c); else rgb = vec3(c, 0.0, x);
    return rgb + m;
  }
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float fresnel = pow(1.0 - max(dot(vNormal, viewDir), 0.0), 3.0);
    float hueBase = 0.65 + sin(uTime * 0.12) * 0.15;
    float hueShift = uBass * 0.2 - uTreble * 0.1;
    float hue = mod(hueBase + hueShift, 1.0);
    vec3 baseColor = hsl2rgb(hue, 0.95, 0.2 + uMid * 0.1);
    float rimHue = mod(hue + 0.35 + uBassVelocity * 0.15, 1.0);
    vec3 rimColor = hsl2rgb(rimHue, 1.0, 0.25 + uTreble * 0.1);
    float pulse = 0.5 + uBass * 0.4 + uBloom * 0.4;
    vec3 innerGlow = baseColor * pulse;
    vec3 color = innerGlow + rimColor * fresnel * (0.8 + uBloom * 0.5);
    float iridescence = sin(dot(vNormal, vec3(1.0, 0.5, 0.3)) * 4.0 + uTime * 0.5) * 0.5 + 0.5;
    color += hsl2rgb(mod(hue + iridescence * 0.3, 1.0), 0.9, 0.15) * 0.2;
    color = min(color, vec3(0.7));
    float alpha = 0.55 + fresnel * 0.35 - uBloom * 0.45;
    alpha = clamp(alpha, 0.05, 0.95);
    gl_FragColor = vec4(color, alpha);
  }`;

function init(THREE: any): void {
  const container = hostEl.value!;
  const w = container.clientWidth || 400;
  const h = container.clientHeight || 300;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 1);
  renderer.autoClear = false;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 100);
  camera.position.z = 3.8;

  const trailScene = new THREE.Scene();
  const trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.12,
    blending: THREE.NormalBlending, depthTest: false,
  });
  trailScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), trailMat));

  const geo = new THREE.IcosahedronGeometry(1.0, 5);
  const basePositions = new Float32Array(geo.attributes.position.array);
  const shaderMat = new THREE.ShaderMaterial({
    vertexShader, fragmentShader,
    uniforms: {
      uBass: { value: 0 }, uMid: { value: 0 }, uTreble: { value: 0 },
      uTime: { value: 0 }, uBloom: { value: 0 }, uBassVelocity: { value: 0 },
    },
    transparent: true, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, shaderMat);
  scene.add(mesh);

  const wireGeo = new THREE.IcosahedronGeometry(0.97, 4);
  const wireBasePositions = new Float32Array(wireGeo.attributes.position.array);
  const wireMat = new THREE.MeshBasicMaterial({
    color: 0x8844ff, wireframe: true, transparent: true, opacity: 0.18,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const wireMesh = new THREE.Mesh(wireGeo, wireMat);
  scene.add(wireMesh);

  const particleCount = 900;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(particleCount * 3);
  const pVel = new Float32Array(particleCount * 3);
  const pBaseR = new Float32Array(particleCount);
  const pPhase = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 1.3 + Math.random() * 1.2;
    pPos[i * 3] = Math.cos(angle) * r;
    pPos[i * 3 + 1] = (Math.random() - 0.5) * 0.8;
    pPos[i * 3 + 2] = Math.sin(angle) * r;
    const speed = 0.003 + Math.random() * 0.006;
    const dir = Math.random() > 0.5 ? 1 : -1;
    pVel[i * 3] = -Math.sin(angle) * speed * dir;
    pVel[i * 3 + 1] = (Math.random() - 0.5) * 0.001;
    pVel[i * 3 + 2] = Math.cos(angle) * speed * dir;
    pBaseR[i] = r;
    pPhase[i] = Math.random() * Math.PI * 2;
  }
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({
    color: 0xaaccff, size: 0.022, transparent: true, opacity: 0.6,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(pGeo, pMat));

  const starCount = 400;
  const sGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 6 + Math.random() * 12;
    sPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    sPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    sPos[i * 3 + 2] = r * Math.cos(phi);
  }
  sGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const sMat = new THREE.PointsMaterial({
    color: 0x8899cc, size: 0.04, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(sGeo, sMat));

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
    THREE, scene, camera, renderer, mesh, geo, basePositions, shaderMat,
    wireMesh, wireGeo, wireBasePositions, wireMat,
    pGeo, pPos, pVel, pBaseR, pPhase, pMat, sMat,
    trailScene, trailCamera, trailMat,
    bloomDecay: 0, camAngle: 0, camRadius: 3.8, targetCamRadius: 3.8, camTilt: 0,
    ro,
  };
}

function tick(time: number): void {
  raf = requestAnimationFrame(tick);
  if (!state) return;
  const s = state;
  const { bass, mid, treble } = bands();
  const bassVelocity = Math.max(0, bass - prevBass);
  prevBass = bass;
  void prevTreble;
  prevTreble = treble;
  const t = time * 0.001;

  s.camAngle += 0.001 + mid * 0.001;
  s.targetCamRadius = 3.6 - bass * 0.3;
  s.camRadius += (s.targetCamRadius - s.camRadius) * 0.02;
  s.camTilt += (Math.sin(t * 0.12) * 0.5 - s.camTilt) * 0.01;
  s.camera.position.x = Math.sin(s.camAngle) * s.camRadius;
  s.camera.position.z = Math.cos(s.camAngle) * s.camRadius;
  s.camera.position.y = s.camTilt;
  s.camera.lookAt(0, 0, 0);

  s.mesh.rotation.y += 0.003 + mid * 0.004;
  s.mesh.rotation.x += 0.001 + treble * 0.002;
  s.mesh.rotation.z += 0.0005;
  s.wireMesh.rotation.copy(s.mesh.rotation);

  const positions = s.geo.attributes.position.array;
  const wPositions = s.wireGeo.attributes.position.array;
  const morphAmp = 0.05 + mid * 0.2 + treble * 0.12;
  const bassInflate = 1.0 + bass * 0.25 + s.bloomDecay * 0.15;
  const nt = t * (0.2 + mid * 0.35);
  const lerpRate = 0.1;
  for (let i = 0; i < positions.length; i += 3) {
    const bx = s.basePositions[i], by = s.basePositions[i + 1], bz = s.basePositions[i + 2];
    const n1 = Math.sin(bx * 3.7 + nt) * Math.cos(by * 4.1 + nt * 0.7) * Math.sin(bz * 2.9 + nt * 1.3);
    const n2 = Math.sin(bx * 7.3 - nt * 0.5) * Math.cos(bz * 5.1 + nt * 0.3) * 0.3;
    const n3 = Math.cos(by * 9.1 + nt * 0.9) * Math.sin(bx * 6.7 - nt * 0.4) * 0.15;
    const morphDisp = 1 + (n1 + n2 + n3) * morphAmp;
    positions[i] += (bx * morphDisp * bassInflate - positions[i]) * lerpRate;
    positions[i + 1] += (by * morphDisp * bassInflate - positions[i + 1]) * lerpRate;
    positions[i + 2] += (bz * morphDisp * bassInflate - positions[i + 2]) * lerpRate;
  }
  s.geo.attributes.position.needsUpdate = true;
  s.geo.computeVertexNormals();

  for (let i = 0; i < wPositions.length; i += 3) {
    const bx = s.wireBasePositions[i], by = s.wireBasePositions[i + 1], bz = s.wireBasePositions[i + 2];
    const n1 = Math.sin(bx * 3.7 + nt) * Math.cos(by * 4.1 + nt * 0.7) * Math.sin(bz * 2.9 + nt * 1.3);
    const morphDisp = 1 + n1 * morphAmp * 0.6;
    wPositions[i] += (bx * morphDisp * bassInflate - wPositions[i]) * lerpRate;
    wPositions[i + 1] += (by * morphDisp * bassInflate - wPositions[i + 1]) * lerpRate;
    wPositions[i + 2] += (bz * morphDisp * bassInflate - wPositions[i + 2]) * lerpRate;
  }
  s.wireGeo.attributes.position.needsUpdate = true;

  s.shaderMat.uniforms.uBass.value = bass;
  s.shaderMat.uniforms.uMid.value = mid;
  s.shaderMat.uniforms.uTreble.value = treble;
  s.shaderMat.uniforms.uTime.value = t;
  s.shaderMat.uniforms.uBassVelocity.value = bassVelocity;

  if (bassVelocity > 0.03) s.bloomDecay = Math.min(1.0, s.bloomDecay + bassVelocity * 4.0);
  s.shaderMat.uniforms.uBloom.value = s.bloomDecay;
  const bassScale = 1 + bass * 0.15 + s.bloomDecay * 0.2;
  s.mesh.scale.setScalar(bassScale);
  s.wireMesh.scale.setScalar(bassScale * 1.02);
  s.bloomDecay = Math.max(0, s.bloomDecay - 0.03);

  const hue = (0.7 + Math.sin(t * 0.08) * 0.12) % 1;
  s.wireMat.color.setHSL(hue, 0.95, 0.25 + treble * 0.1 + s.bloomDecay * 0.1);
  s.wireMat.opacity = 0.1 + bass * 0.1 + s.bloomDecay * 0.6;

  const pPositions = s.pGeo.attributes.position.array;
  const pCount = pPositions.length / 3;
  const bassExpand = 1 + bass * 0.25;
  for (let i = 0; i < pCount; i++) {
    const idx = i * 3;
    const speed = 1 + bass * 1.5;
    pPositions[idx] += s.pVel[idx] * speed;
    pPositions[idx + 1] += s.pVel[idx + 1] + Math.sin(t * 1.5 + s.pPhase[i]) * 0.0005;
    pPositions[idx + 2] += s.pVel[idx + 2] * speed;
    const px = pPositions[idx], pz = pPositions[idx + 2];
    const dist = Math.sqrt(px * px + pz * pz);
    const targetR = s.pBaseR[i] * bassExpand;
    if (dist > 0.01) {
      const correction = (targetR - dist) * 0.01;
      pPositions[idx] += (px / dist) * correction;
      pPositions[idx + 2] += (pz / dist) * correction;
    }
    if (dist > 3.5 || dist < 0.8) {
      const angle = Math.random() * Math.PI * 2;
      const r = 1.3 + Math.random() * 1.0;
      pPositions[idx] = Math.cos(angle) * r;
      pPositions[idx + 1] = (Math.random() - 0.5) * 0.6;
      pPositions[idx + 2] = Math.sin(angle) * r;
    }
  }
  s.pGeo.attributes.position.needsUpdate = true;
  s.pMat.opacity = 0.3 + bass * 0.3;
  s.pMat.size = 0.018 + treble * 0.015;
  s.pMat.color.setHSL((hue + 0.15) % 1, 0.6, 0.5 + treble * 0.15);
  s.sMat.opacity = 0.2 + Math.sin(t * 0.5) * 0.08 + bass * 0.1;

  s.trailMat.opacity = 0.06 + (1.0 - bass) * 0.06;
  s.renderer.render(s.trailScene, s.trailCamera);
  s.renderer.render(s.scene, s.camera);
}

onMounted(async () => {
  if (!isWebGLAvailable()) {
    error.value = "WebGL not available.";
    return;
  }
  try {
    const THREE = await loadThree();
    if (!THREE) throw new Error("three.js global not found");
    init(THREE);
    raf = requestAnimationFrame(tick);
  } catch (err) {
    error.value = `Orb unavailable: ${errorMessage(err)}`;
  }
});

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf);
  if (state) {
    try {
      state.ro.disconnect();
      state.renderer.dispose();
      state.renderer.domElement.parentNode?.removeChild(state.renderer.domElement);
    } catch {
      /* ignore teardown errors */
    }
    state = null;
  }
});
</script>

<style scoped>
.three-orb {
  position: absolute;
  inset: 0;
  background: #000;
}
.orb-msg {
  position: absolute;
  left: 0.75rem;
  bottom: 2.5rem;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}
</style>
