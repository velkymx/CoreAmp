// Inject a vendored UMD script (served from public/vendor) once and resolve
// when it has loaded. Used for three.js which ships as a global-script bundle.
const loaded = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  let p = loaded.get(src);
  if (p) return p;
  p = new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(el);
  });
  loaded.set(src, p);
  return p;
}

// Load three.js and return the global.
export async function loadThree(): Promise<any> {
  await loadScript("/vendor/three.min.js");
  return (window as unknown as { THREE?: unknown }).THREE;
}

// Load the vendored AudioMotion-Analyzer (UMD) and return its constructor.
export async function loadAudioMotion(): Promise<any> {
  await loadScript("/vendor/audiomotion-analyzer.min.js");
  return (window as unknown as { AudioMotionAnalyzer?: unknown }).AudioMotionAnalyzer;
}
