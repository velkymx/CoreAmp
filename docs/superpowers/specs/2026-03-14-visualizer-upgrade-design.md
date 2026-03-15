# Visualizer Upgrade — Spectrum + Reactive 3D

**Date:** 2026-03-14
**Status:** Draft
**Scope:** Replace hand-rolled bars visualizer and Butterchurn/MilkDrop with two new modes: audioMotion-analyzer (Spectrum) and a custom Three.js reactive 3D visualizer (Reactive).

---

## Problem

The current visualizer has two modes:

1. **Bars** — a hand-rolled 34-bar Canvas 2D spectrum analyzer (~300 lines of custom drawing code including peak tracking, spectrum remapping, idle sine animation, gradient rendering). Functional but visually basic.
2. **Milk** — Butterchurn (MilkDrop WebGL2 port). Two vendor scripts (~200KB+), 5 hardcoded presets, WebGL2 requirement, chaotic aesthetic that doesn't match the app's design language.

Neither mode is a differentiator. Modern music players rarely ship a polished, reactive 3D visualizer — this is the opportunity.

## Solution

Two new visualizer modes replacing the existing two:

### Mode 1: Spectrum (audioMotion-analyzer)

A production-grade frequency analyzer with 11 built-in visualization sub-modes.

**Library:** [audioMotion-analyzer](https://github.com/hvianna/audioMotion-analyzer) (~30KB minified, zero dependencies, ES6 module, Canvas 2D)

**Sub-modes available** (user cycles through a curated subset):
- Octave bands (1/3rd octave — mode 6, or 1/6th octave — mode 4)
- Full octave bars (mode 8)
- Discrete frequencies (mode 0)
- Radial spectrum (radial: true)
- Graph/line (mode 10)

**Visual features enabled:**
- LED bar effect
- Luminance bars
- Mirror mode
- Peak indicators
- Round bars
- Gradient color schemes (user can cycle presets)

**Audio graph integration:**
- Constructed with `{ audioCtx: audioContext, connectSpeakers: false }` — shares our existing AudioContext but does NOT re-route audio to speakers (we already handle that)
- Audio source connected via `audioMotion.connectInput(gainNode)` — taps audio after the DSP chain, same point where our existing `analyserNode` is connected. audioMotion creates its own internal AnalyserNode for FFT; this is intentional to avoid contention on our shared `analyserNode`
- The `gainNode → analyserNode → destination` chain is unchanged; audioMotion observes the signal in parallel
- Renders into `<div id="visualizerContainer">` — audioMotion creates its own `<canvas>` inside
- When Spectrum mode is deactivated, call `audioMotion.destroy()` to disconnect from the graph and release the canvas

### Mode 2: Reactive (Three.js custom)

A curated, iTunes-inspired reactive 3D scene. One polished visualization, not a preset carousel.

**Libraries:**
- three.js (~150KB) — loaded via IIFE/UMD-compatible build (`dist/vendor/three.min.js`). Three.js r169+ ships a standalone `three.webgpu.js` but we use the classic WebGL build which still ships as a self-contained file. If the npm package no longer provides a UMD build, we create one: `import * as THREE from 'three'; window.THREE = THREE;` bundled with esbuild into a single IIFE.
- Simplex noise (inline GLSL function in the vertex shader, no extra dependency)

**Visual design:**
- A glowing wireframe icosahedron (128 segments) centered in the viewport
- Vertices displaced by 3D Simplex noise, modulated by audio energy:
  - Bass energy (20–250 Hz) drives displacement amplitude (range: 0.02 base → 0.5 max)
  - Mid energy (250–2000 Hz) drives noise speed/turbulence (range: 0.3 base → 2.0 max)
  - Treble energy (2000–16000 Hz) drives color shifting and edge glow intensity
- Fresnel rim glow on mesh edges, color shifting smoothly between warm (amber/coral) and cool (cyan/blue) based on spectral balance
- Subtle particle field (200–400 small dots) orbiting the sphere at low velocity, alpha pulsing to beat
- Background: near-black with faint radial gradient that breathes with overall amplitude
- All motion smoothed/interpolated — no jitter, no snapping. Organic, fluid feel.

**Idle state (no audio playing):**
- Icosahedron rotates slowly (0.002 rad/frame Y-axis, 0.001 rad/frame X-axis)
- Noise field animates at base speed (uTime advances at 0.3x normal rate)
- Displacement amplitude stays at minimum (0.02) — sphere gently undulates
- Particle field continues orbiting at base velocity
- Color holds at a cool blue-cyan resting state
- Overall: a living, breathing ambient scene that invites you to hit play

**Audio data pipeline:**
- Reads from the existing `analyserNode` (FFT size 512) — NOT audioMotion's internal analyser
- Each animation frame: `analyserNode.getByteFrequencyData(analyserData)` → compute bass/mid/treble energy scalars (0–1) by averaging frequency bins in each band
- Energy values smoothed with exponential moving average: `smoothed = smoothed * 0.85 + raw * 0.15`
- Scalars passed as shader uniforms: `uBass`, `uMid`, `uTreble`, `uTime`
- Bass trigger (peak detection): when `bass > 0.6 && bass - prevBass > 0.15`, fire a transient bloom on the mesh (brief scale pulse + brightness spike, decays over 300ms)

**Rendering:**
- Single `WebGLRenderer` instance, created on first activation, destroyed on mode switch to free GPU
- `requestAnimationFrame` loop, skipped when `document.hidden` is true
- Canvas sized to visualizer container, auto-resized on container resize via `ResizeObserver`
- Target 60fps; graceful degradation: if 3 consecutive frames exceed 20ms, reduce particle count by 50% (one-time step-down, not progressive). Recovery: if 60 consecutive frames are under 14ms, restore full particle count.

### Toolbar

Current: `Bars` | `Milk` | `Prev` | `Next` | `Auto` | `Full`

New: `Spectrum` | `Reactive` | `Full`

- **Spectrum** button: activates audioMotion mode. Clicking again while already active cycles sub-modes (octave → radial → graph → discrete → back to octave).
- **Reactive** button: activates Three.js 3D mode.
- **Full** button: toggles pseudo-fullscreen (unchanged behavior).
- Milk-specific buttons (Prev, Next, Auto) removed entirely.
- All buttons retain `type="button"`, ARIA labels (`aria-label="Switch to spectrum visualizer"`), and keyboard accessibility via existing toolbar CSS.

Active mode persisted to `localStorage` key `coreamp.visualizerMode` (values: `"spectrum"`, `"reactive"`). Sub-mode index persisted to `coreamp.spectrumSubMode`.

**localStorage migration:** On load, if the stored value is `"bars"`, map to `"spectrum"`. If `"milk"`, map to `"reactive"`. Any other unrecognized value defaults to `"spectrum"`.

### Native Playback Behavior

When `preferNativePlayback` is true and `nativeAudioAvailable` is true, no Web Audio graph exists — `analyserNode` is null and audioMotion has no signal to analyze.

**Behavior:**
- **Spectrum mode:** audioMotion renders flat (zero signal). This is acceptable — the bars simply sit at the floor. No special handling needed.
- **Reactive mode:** All energy scalars stay at 0, so the idle animation plays (slow rotation, gentle undulation, cool blue). This looks intentional, not broken.
- No forced mode switching. Both modes degrade gracefully to their idle states.

### Error Handling and Fallbacks

**WebGL failure (Reactive mode):**
- On first activation, attempt `document.createElement('canvas').getContext('webgl')`. If null, disable the Reactive button (`disabled` attribute + tooltip "WebGL not available"), default to Spectrum.
- If `WebGLRenderer` construction throws at runtime, catch the error, log it, destroy the renderer, disable the Reactive button, switch to Spectrum, show status "3D visualizer unavailable."

**audioMotion failure (Spectrum mode):**
- If `new AudioMotionAnalyzer()` throws, catch the error, log it, disable the Spectrum button, switch to Reactive.
- If both fail, show a static "No visualizer available" message in the container.

**Fault counter:** Remove the existing `visualizerFaultCount` / `handleVisualizerFault()` mechanism. The new per-mode error handling replaces it.

### Fullscreen

Both modes work in fullscreen. Spectrum: audioMotion auto-resizes its canvas. Reactive: `ResizeObserver` on the container triggers `renderer.setSize()` and camera aspect update. No behavioral changes to the existing fullscreen toggle.

Escape key exits fullscreen (unchanged). The fullscreen resize handlers that previously called `resizeMilkVisualizer()` are replaced with the `ResizeObserver` approach.

## What Gets Removed

### Vendor scripts
- `dist/vendor/butterchurn.min.js`
- `dist/vendor/butterchurnPresetsMinimal.min.js`
- `<script>` tags loading them

### HTML elements
- `<canvas id="milkCanvas">`
- `<canvas id="barsCanvas">` and `<div id="visualizerBars">`
- `<button id="visualizerBarsBtn">`
- `<button id="visualizerMilkBtn">`
- `<button id="milkPrevBtn">`
- `<button id="milkNextBtn">`
- `<button id="milkAutoBtn">`

### CSS rules
- `.milk-canvas`, `.milk-mode`, `.visualizer-bars`, `.bars-canvas`

### JS variables
- `milkVisualizer`, `milkPresetNames`, `milkPresetIndex`, `milkAutoCycle`, `milkLastRenderTime`, `visualizerFaultCount`
- `barsCanvasCtx`, `barsCanvasWidth`, `barsCanvasHeight`
- `visualizerSpectrum`, `visualizerLevels`, `visualizerPeakLevels`, `visualizerPeakVelocity`
- `EQ_BAR_COUNT`, `MILK_PRESET_NAMES`

### JS functions
- `butterchurnApi()`, `butterchurnPresetsApi()`
- `ensureMilkVisualizer()`, `isMilkSupported()`, `resizeMilkVisualizer()`
- `cycleMilkPreset()`, `setMilkAutoCycle()`, `activateMilkMode()`, `updateMilkControls()`
- `handleVisualizerFault()`
- `drawBarsVisualizer()`, `remapSpectrumToBars()`
- `ensureBarsCanvas()`, `resizeBarsCanvas()`, `ensureVisualizerBuffers()`

### JS references
- `milkCanvasEl` DOM reference
- `window.addEventListener("resize", resizeBarsCanvas)` listener
- Milk rendering block inside `animateVisualizer()`
- Bars rendering block inside `animateVisualizer()` (the unconditional `drawBarsVisualizer()` call)
- `activateMilkMode()` force-setting `preferNativePlayback = false`

### Retained
- `analyserNode` and `analyserData` — reused by Reactive mode
- `audioContext` — shared with audioMotion via constructor
- `animateVisualizer()` function — rewritten but same name
- `setVisualizerMode()` function — rewritten but same name
- `visualizerMode` variable — rewritten to hold `"spectrum"` or `"reactive"`
- Fullscreen toggle mechanism (pseudo-fullscreen class on playerPanel)
- `document.hidden` check in animation loop

## What Gets Added

1. **Vendor script** — `dist/vendor/audiomotion-analyzer.min.js` (~30KB) loaded via `<script>` tag
2. **Vendor script** — `dist/vendor/three.min.js` (~150KB) loaded via `<script>` tag (IIFE build exposing `window.THREE`)
3. **Container div** — `<div id="visualizerContainer">` replacing both canvases. audioMotion creates its own canvas inside; Three.js creates its own canvas inside. Only one is active at a time.
4. **Toolbar buttons** — `<button id="visualizerSpectrumBtn">` and `<button id="visualizerReactiveBtn">` replacing old mode buttons
5. **JS: Spectrum functions** (~40 lines) — `initSpectrumVisualizer()`, `destroySpectrumVisualizer()`, `cycleSpectrumSubMode()`
6. **JS: Reactive functions** (~200 lines) — `initReactiveVisualizer(container)`, `destroyReactiveVisualizer()`, `tickReactiveVisualizer(bass, mid, treble, time)`
7. **JS: Energy computation** (~20 lines) — `computeAudioEnergy(analyserData)` returning `{ bass, mid, treble }` scalars
8. **Updated `setVisualizerMode(mode)`** — handles `"spectrum"` and `"reactive"`, calls init/destroy
9. **Updated `animateVisualizer()`** — simplified: read FFT data, compute energy, dispatch to active mode

## Data Flow

```
Audio Element
  → MediaElementSource
  → [EQ / DSP chain]
  → gainNode ──────────→ audioMotion.connectInput(gainNode)
  │                        (audioMotion creates its own internal AnalyserNode)
  → analyserNode ──→ animateVisualizer() reads getByteFrequencyData()
  │                    └─ Reactive mode: computeAudioEnergy() → shader uniforms
  → destination

Spectrum mode: audioMotion handles its own rendering loop internally
Reactive mode: animateVisualizer() drives the Three.js render loop
```

audioMotion taps `gainNode` directly (parallel to our `analyserNode`). The Reactive mode reads from our existing `analyserNode`. Neither mode modifies the existing `gainNode → analyserNode → destination` chain.

## Migration

This is a swap, not an incremental addition. The implementation order:

1. Add vendor scripts (audioMotion, Three.js) to `dist/vendor/`
2. Add `<script>` tags and new container div to HTML
3. Remove Butterchurn `<script>` tags, vendor files, Milk HTML elements, and all Milk JS
4. Remove hand-rolled bars HTML elements and all bars JS
5. Remove associated CSS rules
6. Implement `computeAudioEnergy()` utility
7. Implement Spectrum mode (audioMotion init/destroy/cycle)
8. Implement Reactive mode (Three.js scene, shaders, init/destroy/tick)
9. Rewrite `setVisualizerMode()` and `animateVisualizer()`
10. Update toolbar buttons, event listeners, localStorage persistence with migration
11. Update fullscreen behavior (ResizeObserver)
12. Test: both modes with audio, idle state, native playback, mode switching, fullscreen

## Risks

- **Three.js bundle size** (~150KB) — acceptable for a desktop app; net-zero vs Butterchurn removal
- **WebGL availability** — Three.js needs WebGL1 (not WebGL2 like Butterchurn). WebGL1 is available in all Tauri WebViews. If unavailable, fall back to Spectrum-only with disabled button.
- **GPU memory** — Three.js renderer is created on activation and destroyed on mode switch to avoid holding GPU resources when not visible
- **audioMotion IIFE build** — the library is natively ES6 module. For the single-file HTML architecture, we need a UMD/IIFE build. The npm package includes `dist/audioMotion-analyzer.js` which can be loaded as a regular script exposing `AudioMotionAnalyzer` globally. If not, we wrap with esbuild.
- **Two AnalyserNodes** — audioMotion creates its own internal AnalyserNode (connected to `gainNode`), and we keep our existing one (also connected to `gainNode`). Two FFT computations per frame. On desktop hardware this is negligible (~0.1ms per FFT at size 512). Only one is active at a time (audioMotion's when in Spectrum mode, ours when in Reactive mode), but both remain connected. Acceptable trade-off for clean separation.

## Success Criteria

- Both modes render at 60fps on a 2020+ Mac
- Reactive mode visually responds to bass, mids, and treble distinctly
- Switching modes is instant (no loading delay after first activation)
- Idle state (no audio) shows a subtle ambient animation in both modes
- Native playback mode: both visualizers degrade gracefully to idle animation
- Total vendor JS added is under 200KB (audioMotion 30KB + Three.js 150KB = 180KB)
- Total vendor JS removed is ~200KB+ (Butterchurn)
- Net bundle size change is approximately zero
- No audio routing side effects — removing/adding visualizer modes does not affect playback volume, DSP chain, or output
