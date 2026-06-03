// Inject a vendored UMD script (served from public/vendor) once and resolve
// when its global is present. Used for butterchurn / three which ship as
// global-script bundles rather than ES modules.
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

// Load butterchurn + its preset pack, returning the globals.
export async function loadButterchurn(): Promise<{
  butterchurn: any;
  presets: Record<string, unknown>;
}> {
  await loadScript("/vendor/butterchurn.min.js");
  await loadScript("/vendor/butterchurnPresetsMinimal.min.js");
  const w = window as unknown as {
    butterchurn?: { default?: unknown } | unknown;
    butterchurnPresetsMinimal?: { getPresets?: () => Record<string, unknown> } | unknown;
  };
  const bc = (w.butterchurn as any)?.default ?? w.butterchurn;
  const presetMod = w.butterchurnPresetsMinimal as any;
  const presets = presetMod?.getPresets ? presetMod.getPresets() : presetMod ?? {};
  return { butterchurn: bc, presets };
}
