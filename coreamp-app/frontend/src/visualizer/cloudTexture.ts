// Procedural cloud density used to paint the Storm visualizer's cloud sprites.
// Hash-based value noise summed over a few octaves (fractal Brownian motion)
// gives wispy, natural structure; a radial mask feathers the sprite edges so
// the square plane never shows a hard seam.

function hash(x: number, y: number, seed: number): number {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + seed * 1442695041;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// Bilinearly-interpolated value noise at lattice resolution 1.
function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash(xi, yi, seed);
  const tr = hash(xi + 1, yi, seed);
  const bl = hash(xi, yi + 1, seed);
  const br = hash(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  const top = tl + (tr - tl) * u;
  const bottom = bl + (br - bl) * u;
  return top + (bottom - top) * v;
}

// Fractal Brownian motion: layered octaves of value noise, normalized to 0..1.
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x * frequency, y * frequency, seed + i) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

// Cloud alpha at normalized texture coords (nx, ny in [0,1]). Returns 0..1.
export function cloudDensity(nx: number, ny: number, seed: number): number {
  const n = fbm(nx * 4, ny * 4, seed);
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  // Radial falloff: 1 at centre, 0 at the mid-edge, clamped past that.
  const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
  // Bias down so thin noise reads as wispy edges rather than a solid disc.
  const density = n * radial * 1.7 - 0.2;
  return Math.max(0, Math.min(1, density));
}
