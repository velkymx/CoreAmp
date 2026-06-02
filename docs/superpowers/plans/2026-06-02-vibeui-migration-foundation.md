# VibeUI Migration — Milestone 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a bootable Vue 3 + VibeUI + TypeScript + Pinia frontend built by Vite into `coreamp-app/dist`, with a typed Tauri API layer and a fully TDD'd player store whose `togglePlayback` action structurally fixes the H-A (fall-through) and H-B (re-entrancy) bugs.

**Architecture:** New `coreamp-app/frontend/` Vite project replaces the hand-written `dist/index.html`. The Rust backend is untouched and reached only through `src/api/tauri.ts`. Playback state lives in a Pinia `player` store (single source of truth); transport effects are delegated to two injectable drivers (native via Tauri, web via an `<audio>` adapter) so the decision logic is deterministically unit-testable.

**Tech Stack:** Vue 3, Vite, TypeScript (strict), Pinia, `@velkymx/vibeui@1.0.2` (+ peers: bootstrap 5.3, bootstrap-icons, dompurify, quill), vitest + @vue/test-utils.

**Reference spec:** `docs/superpowers/specs/2026-06-02-vibeui-migration-design.md`. Per its Implementation Constraints: review the VibeUI component docs before using a component, and always prefer a VibeUI component over hand-rolled markup.

---

## File Structure (this milestone)

```
coreamp-app/frontend/
  package.json              # deps + scripts (dev/build/test/typecheck)
  vite.config.ts            # Vite + vitest config, build.outDir -> ../dist
  tsconfig.json             # strict TS
  index.html                # Vite entry
  src/
    main.ts                 # createApp + VibeUI + Pinia + CSS
    App.vue                 # shell: VibeTabs + placeholder views
    vite-env.d.ts           # Vue SFC type shim
    types.ts                # shared types: Track, Source, NativeStatus
    api/tauri.ts            # typed invoke() wrappers (native audio subset)
    playback/webDriver.ts   # <audio> adapter behind a typed interface
    stores/player.ts        # Pinia player store (togglePlayback fix)
    components/TransportControls.vue
  tests/
    setup.ts                # @vue/test-utils + Pinia test setup
    stores/player.spec.ts   # togglePlayback truth table + re-entrancy
    components/TransportControls.spec.ts
coreamp-app/tauri.conf.json # build hooks + CSP (modify)
```

---

## Task 1: Scaffold the Vite + Vue + TS project

**Files:**
- Create: `coreamp-app/frontend/package.json`
- Create: `coreamp-app/frontend/vite.config.ts`
- Create: `coreamp-app/frontend/tsconfig.json`
- Create: `coreamp-app/frontend/index.html`
- Create: `coreamp-app/frontend/src/vite-env.d.ts`
- Create: `coreamp-app/frontend/src/main.ts`
- Create: `coreamp-app/frontend/src/App.vue`
- Create: `coreamp-app/frontend/.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "coreamp-frontend",
  "private": true,
  "version": "0.4.0",
  "type": "module",
  "scripts": {
    "dev": "vite --port 1420 --strictPort",
    "build": "vue-tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "vue-tsc --noEmit"
  },
  "dependencies": {
    "@tauri-apps/api": "^2",
    "@velkymx/vibeui": "1.0.2",
    "bootstrap": "^5.3.0",
    "bootstrap-icons": "^1.11.0",
    "dompurify": "^3.0.0",
    "pinia": "^2.2.0",
    "quill": "^2.0.0",
    "vue": "^3.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.1.0",
    "@vue/test-utils": "^2.4.6",
    "jsdom": "^25.0.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0",
    "vue-tsc": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`** (build output to `../dist`, vitest jsdom)

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 3: Create `tsconfig.json`** (strict)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "jsx": "preserve",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CoreAmp</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
```

- [ ] **Step 6: Create minimal `src/App.vue`** (replaced in Task 8)

```vue
<template>
  <main class="p-3">
    <h1>CoreAmp</h1>
  </main>
</template>

<script setup lang="ts"></script>
```

- [ ] **Step 7: Create minimal `src/main.ts`** (expanded in Task 2)

```ts
import { createApp } from "vue";
import App from "./App.vue";

createApp(App).mount("#app");
```

- [ ] **Step 8: Create `.gitignore`**

```
node_modules
```

- [ ] **Step 9: Install dependencies**

Run: `npm --prefix coreamp-app/frontend install`
Expected: completes; `node_modules` created; no peer-dep errors that abort install.

- [ ] **Step 10: Verify the build outputs to `coreamp-app/dist`**

Run: `npm --prefix coreamp-app/frontend run build`
Expected: `vue-tsc` passes, `vite build` writes `coreamp-app/dist/index.html` + `assets/`.

- [ ] **Step 11: Commit**

```bash
git add coreamp-app/frontend/package.json coreamp-app/frontend/package-lock.json \
  coreamp-app/frontend/vite.config.ts coreamp-app/frontend/tsconfig.json \
  coreamp-app/frontend/index.html coreamp-app/frontend/.gitignore \
  coreamp-app/frontend/src/vite-env.d.ts coreamp-app/frontend/src/main.ts \
  coreamp-app/frontend/src/App.vue
git commit -m "build: scaffold Vite + Vue 3 + TS frontend project"
```

---

## Task 2: Register VibeUI, Pinia, and Bootstrap CSS

**Files:**
- Modify: `coreamp-app/frontend/src/main.ts`

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { createApp } from "vue";
import { createPinia } from "pinia";
import VibeUI from "@velkymx/vibeui";
import App from "./App.vue";

// Bootstrap CSS is imported by us; Bootstrap JS is managed by VibeUI internally.
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "@velkymx/vibeui/dist/style.css";

createApp(App).use(createPinia()).use(VibeUI).mount("#app");
```

- [ ] **Step 2: Verify the build still succeeds**

Run: `npm --prefix coreamp-app/frontend run build`
Expected: PASS. CSS bundled into `../dist/assets`.

- [ ] **Step 3: Commit**

```bash
git add coreamp-app/frontend/src/main.ts
git commit -m "build: register VibeUI plugin, Pinia, and Bootstrap CSS"
```

---

## Task 3: Stand up the vitest harness

**Files:**
- Create: `coreamp-app/frontend/tests/setup.ts`
- Create: `coreamp-app/frontend/tests/smoke.spec.ts`

- [ ] **Step 1: Create `tests/setup.ts`**

```ts
import { config } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach } from "vitest";

beforeEach(() => {
  setActivePinia(createPinia());
});

// Register a fresh Pinia per test so stores are isolated.
config.global.plugins = [];
```

- [ ] **Step 2: Create a sanity test `tests/smoke.spec.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("vitest harness", () => {
  it("runs and asserts", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 3: Run tests and verify the harness works**

Run: `npm --prefix coreamp-app/frontend run test`
Expected: PASS — 1 passed.

- [ ] **Step 4: Commit**

```bash
git add coreamp-app/frontend/tests/setup.ts coreamp-app/frontend/tests/smoke.spec.ts
git commit -m "test: add vitest + Vue Test Utils harness"
```

---

## Task 4: Shared types and typed Tauri API layer (native audio subset)

**Files:**
- Create: `coreamp-app/frontend/src/types.ts`
- Create: `coreamp-app/frontend/src/api/tauri.ts`
- Test: `coreamp-app/frontend/tests/api/tauri.spec.ts`

> Note: the Rust `native_audio_status` returns snake_case fields (`current_path`, etc.) with no serde rename — verify against `coreamp-app/src/main.rs:126` before relying on names.

- [ ] **Step 1: Create `src/types.ts`**

```ts
export type Source = "native" | "web";

export interface Track {
  path: string;
  title: string | null;
  artist: string | null;
  album: string | null;
}

export interface NativeStatus {
  available: boolean;
  active: boolean;
  paused: boolean;
  finished: boolean;
  current_path: string | null;
  detail: string | null;
}
```

- [ ] **Step 2: Write the failing test `tests/api/tauri.spec.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

import { nativeAudioStatus, nativeAudioPause } from "@/api/tauri";

describe("api/tauri", () => {
  beforeEach(() => invokeMock.mockReset());

  it("nativeAudioStatus returns the typed status from invoke", async () => {
    invokeMock.mockResolvedValue({
      available: true, active: true, paused: false,
      finished: false, current_path: "/m/a.mp3", detail: null,
    });
    const status = await nativeAudioStatus();
    expect(invokeMock).toHaveBeenCalledWith("native_audio_status");
    expect(status.active).toBe(true);
  });

  it("nativeAudioPause throws a TauriError carrying the command on failure", async () => {
    invokeMock.mockRejectedValue("device gone");
    await expect(nativeAudioPause()).rejects.toMatchObject({
      command: "native_audio_pause",
      message: "device gone",
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm --prefix coreamp-app/frontend run test -- tauri.spec`
Expected: FAIL — cannot find module `@/api/tauri`.

- [ ] **Step 4: Create `src/api/tauri.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { NativeStatus } from "@/types";

export class TauriError extends Error {
  constructor(public command: string, public override message: string) {
    super(message);
    this.name = "TauriError";
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return (await invoke(command, args)) as T;
  } catch (err) {
    throw new TauriError(command, String(err));
  }
}

export const nativeAudioStatus = () => call<NativeStatus>("native_audio_status");
export const nativeAudioPause = () => call<void>("native_audio_pause");
export const nativeAudioResume = () => call<void>("native_audio_resume");
export const nativeAudioStop = () => call<void>("native_audio_stop");
export const nativeAudioPlay = (path: string) =>
  call<void>("native_audio_play", { path });
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm --prefix coreamp-app/frontend run test -- tauri.spec`
Expected: PASS — 2 passed.

- [ ] **Step 6: Commit**

```bash
git add coreamp-app/frontend/src/types.ts coreamp-app/frontend/src/api/tauri.ts \
  coreamp-app/frontend/tests/api/tauri.spec.ts
git commit -m "feat: add shared types and typed native-audio Tauri API layer"
```

---

## Task 5: Web playback driver behind a typed interface

**Files:**
- Create: `coreamp-app/frontend/src/playback/webDriver.ts`

This isolates the `<audio>` element so the store's decision logic is testable by mocking this module. No test of its own this milestone (thin DOM adapter); it is exercised through the store tests via mock.

- [ ] **Step 1: Create `src/playback/webDriver.ts`**

```ts
// Thin adapter over a single HTMLAudioElement. The store calls this for the
// 'web' source; tests mock this module so decision logic stays deterministic.
let el: HTMLAudioElement | null = null;

function audio(): HTMLAudioElement {
  if (!el) el = new Audio();
  return el;
}

export const webDriver = {
  isLoaded(): boolean {
    return Boolean(audio().src);
  },
  isPaused(): boolean {
    return audio().paused;
  },
  pause(): void {
    audio().pause();
  },
  async resume(): Promise<void> {
    await audio().play();
  },
};

export type WebDriver = typeof webDriver;
```

- [ ] **Step 2: Verify typecheck**

Run: `npm --prefix coreamp-app/frontend run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add coreamp-app/frontend/src/playback/webDriver.ts
git commit -m "feat: add web playback driver adapter"
```

---

## Task 6: Player store — state + `togglePlayback` (the H-A / H-B fix)

**Files:**
- Create: `coreamp-app/frontend/src/stores/player.ts`
- Test: `coreamp-app/frontend/tests/stores/player.spec.ts`

- [ ] **Step 1: Write the failing test `tests/stores/player.spec.ts`** (truth table + re-entrancy)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/tauri", () => ({
  nativeAudioPause: vi.fn().mockResolvedValue(undefined),
  nativeAudioResume: vi.fn().mockResolvedValue(undefined),
  nativeAudioPlay: vi.fn().mockResolvedValue(undefined),
  nativeAudioStop: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/playback/webDriver", () => ({
  webDriver: {
    isLoaded: vi.fn(() => false),
    isPaused: vi.fn(() => true),
    pause: vi.fn(),
    resume: vi.fn().mockResolvedValue(undefined),
  },
}));

import { nativeAudioPause, nativeAudioResume } from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";
import { usePlayerStore } from "@/stores/player";

const track = { path: "/m/a.mp3", title: "A", artist: "X", album: "Y" };

describe("player.togglePlayback", () => {
  beforeEach(() => vi.clearAllMocks());

  it("native + playing -> pauses native", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: true });
    await p.togglePlayback();
    expect(nativeAudioPause).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(false);
  });

  it("native + paused -> resumes native", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: false });
    await p.togglePlayback();
    expect(nativeAudioResume).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(true);
  });

  it("web + loaded + playing -> pauses web", async () => {
    (webDriver.isLoaded as any).mockReturnValue(true);
    const p = usePlayerStore();
    p.$patch({ source: "web", isPlaying: true });
    await p.togglePlayback();
    expect(webDriver.pause).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(false);
  });

  it("web + loaded + paused -> resumes web", async () => {
    (webDriver.isLoaded as any).mockReturnValue(true);
    const p = usePlayerStore();
    p.$patch({ source: "web", isPlaying: false });
    await p.togglePlayback();
    expect(webDriver.resume).toHaveBeenCalledOnce();
    expect(p.isPlaying).toBe(true);
  });

  it("DESYNC: native selected but nothing loaded + queued -> plays current, never silent", async () => {
    (webDriver.isLoaded as any).mockReturnValue(false);
    const p = usePlayerStore();
    // native selected, not actually playing, web empty, but a track is queued
    p.$patch({ source: "native", nativeAvailable: false, isPlaying: false, queue: [track], currentIndex: 0 });
    const result = await p.togglePlayback();
    expect(result).not.toBe("noop");
    expect(p.isPlaying).toBe(true);
  });

  it("re-entrancy: second call while in flight returns 'busy' and does not double-invoke", async () => {
    const p = usePlayerStore();
    p.$patch({ source: "native", nativeAvailable: true, isPlaying: true });
    const first = p.togglePlayback();
    const second = await p.togglePlayback();
    await first;
    expect(second).toBe("busy");
    expect(nativeAudioPause).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix coreamp-app/frontend run test -- player.spec`
Expected: FAIL — cannot find module `@/stores/player`.

- [ ] **Step 3: Create `src/stores/player.ts`**

```ts
import { defineStore } from "pinia";
import type { Source, Track } from "@/types";
import * as api from "@/api/tauri";
import { webDriver } from "@/playback/webDriver";

export type ToggleResult = "paused" | "resumed" | "played" | "busy" | "noop";

interface PlayerState {
  queue: Track[];
  currentIndex: number;
  isPlaying: boolean;
  source: Source;
  nativeAvailable: boolean;
  inFlight: boolean;
}

export const usePlayerStore = defineStore("player", {
  state: (): PlayerState => ({
    queue: [],
    currentIndex: -1,
    isPlaying: false,
    source: "web",
    nativeAvailable: false,
    inFlight: false,
  }),
  actions: {
    async playCurrent(): Promise<void> {
      const track = this.queue[this.currentIndex];
      if (!track) return;
      if (this.source === "native" && this.nativeAvailable) {
        await api.nativeAudioPlay(track.path);
      } else {
        await webDriver.resume();
      }
      this.isPlaying = true;
    },

    async togglePlayback(): Promise<ToggleResult> {
      if (this.inFlight) return "busy"; // H-B: no concurrent transitions
      this.inFlight = true;
      try {
        if (this.source === "native" && this.nativeAvailable) {
          if (this.isPlaying) {
            await api.nativeAudioPause();
            this.isPlaying = false;
            return "paused";
          }
          await api.nativeAudioResume();
          this.isPlaying = true;
          return "resumed";
        }

        // Web source (or native unavailable). Decide on authoritative state,
        // never on a transient status read (H-A).
        if (webDriver.isLoaded()) {
          if (this.isPlaying) {
            webDriver.pause();
            this.isPlaying = false;
            return "paused";
          }
          await webDriver.resume();
          this.isPlaying = true;
          return "resumed";
        }

        // Nothing loaded: if a track is queued, play it. Never silently no-op
        // when there is something to play (the H-A failure mode).
        if (this.currentIndex >= 0 && this.currentIndex < this.queue.length) {
          await this.playCurrent();
          return "played";
        }
        return "noop";
      } finally {
        this.inFlight = false; // released even on error: buttons never wedge
      }
    },
  },
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix coreamp-app/frontend run test -- player.spec`
Expected: PASS — 6 passed.

- [ ] **Step 5: Commit**

```bash
git add coreamp-app/frontend/src/stores/player.ts coreamp-app/frontend/tests/stores/player.spec.ts
git commit -m "feat: add player store with re-entrancy-safe togglePlayback (fixes H-A/H-B)"
```

---

## Task 7: `TransportControls.vue` + component test

**Files:**
- Create: `coreamp-app/frontend/src/components/TransportControls.vue`
- Test: `coreamp-app/frontend/tests/components/TransportControls.spec.ts`

> Review the VibeUI `VibeButton` and `VibeIcon` docs before this task. `VibeButton` exposes `variant`/`size`/`outline`/`disabled` and emits native `click`; `VibeIcon` takes a bootstrap-icons `name`.

- [ ] **Step 1: Write the failing test `tests/components/TransportControls.spec.ts`**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import TransportControls from "@/components/TransportControls.vue";
import { usePlayerStore } from "@/stores/player";

describe("TransportControls", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("clicking play/pause calls the store action", async () => {
    const wrapper = mount(TransportControls, {
      global: { stubs: { VibeButton: { template: "<button><slot/></button>" }, VibeIcon: true } },
    });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "togglePlayback").mockResolvedValue("paused");
    await wrapper.get('[data-test="toggle"]').trigger("click");
    expect(spy).toHaveBeenCalledOnce();
  });

  it("the play/pause icon reflects isPlaying (no manual sync)", async () => {
    const wrapper = mount(TransportControls, {
      global: { stubs: { VibeButton: { template: '<button><slot/></button>' }, VibeIcon: { props: ["name"], template: '<i :data-icon="name"></i>' } } },
    });
    const player = usePlayerStore();
    player.isPlaying = true;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="pause-fill"]').exists()).toBe(true);
    player.isPlaying = false;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-icon="play-fill"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm --prefix coreamp-app/frontend run test -- TransportControls`
Expected: FAIL — cannot find module `@/components/TransportControls.vue`.

- [ ] **Step 3: Create `src/components/TransportControls.vue`**

```vue
<template>
  <div class="transport-controls d-inline-flex align-items-center gap-2">
    <VibeButton variant="secondary" aria-label="Previous track" @click="player.prevTrack?.()">
      <VibeIcon name="skip-start-fill" />
    </VibeButton>
    <VibeButton
      variant="primary"
      data-test="toggle"
      aria-label="Play or pause"
      @click="player.togglePlayback()"
    >
      <VibeIcon :name="player.isPlaying ? 'pause-fill' : 'play-fill'" />
    </VibeButton>
    <VibeButton variant="secondary" aria-label="Next track" @click="player.nextTrack?.()">
      <VibeIcon name="skip-end-fill" />
    </VibeButton>
  </div>
</template>

<script setup lang="ts">
import { usePlayerStore } from "@/stores/player";
const player = usePlayerStore();
</script>
```

> `prevTrack`/`nextTrack` are added in a later milestone; the optional-call guard
> keeps this component valid now. The play/pause icon binds to `player.isPlaying`
> — the manual `setToggleIcon` drift from the legacy code is gone by construction.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm --prefix coreamp-app/frontend run test -- TransportControls`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add coreamp-app/frontend/src/components/TransportControls.vue \
  coreamp-app/frontend/tests/components/TransportControls.spec.ts
git commit -m "feat: add TransportControls component with reactive play/pause icon"
```

---

## Task 8: App shell with VibeTabs and placeholder views

**Files:**
- Modify: `coreamp-app/frontend/src/App.vue`

> Review the VibeUI `VibeTabs` / `VibeTab` docs first: `VibeTabs` uses `v-model`
> for the active tab; each `VibeTab` takes `name` and `title`.

- [ ] **Step 1: Replace `src/App.vue`**

```vue
<template>
  <div class="app-shell">
    <VibeTabs v-model="activeTab" fill>
      <VibeTab name="home" title="Home"><HomePlaceholder /></VibeTab>
      <VibeTab name="library" title="Library"><Placeholder label="Library" /></VibeTab>
      <VibeTab name="liked" title="Liked"><Placeholder label="Liked" /></VibeTab>
      <VibeTab name="playlists" title="Playlists"><Placeholder label="Playlists" /></VibeTab>
      <VibeTab name="audio" title="Audio"><Placeholder label="Audio" /></VibeTab>
      <VibeTab name="settings" title="Settings"><Placeholder label="Settings" /></VibeTab>
    </VibeTabs>
    <footer class="player-bar p-2 border-top">
      <TransportControls />
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, defineComponent, h } from "vue";
import TransportControls from "@/components/TransportControls.vue";

const activeTab = ref("home");

const Placeholder = defineComponent({
  props: { label: { type: String, required: true } },
  setup: (props) => () => h("div", { class: "p-3 text-secondary" }, `${props.label} — coming soon`),
});
const HomePlaceholder = defineComponent({
  setup: () => () => h("div", { class: "p-3" }, "CoreAmp"),
});
</script>

<style scoped>
.app-shell { display: flex; flex-direction: column; min-height: 100vh; }
.player-bar { position: sticky; bottom: 0; background: var(--bs-body-bg); }
</style>
```

- [ ] **Step 2: Verify build + typecheck**

Run: `npm --prefix coreamp-app/frontend run build`
Expected: PASS. `../dist/index.html` regenerated.

- [ ] **Step 3: Commit**

```bash
git add coreamp-app/frontend/src/App.vue
git commit -m "feat: add app shell with VibeTabs and transport footer"
```

---

## Task 9: Point Tauri at the Vite build and tighten CSP

**Files:**
- Modify: `coreamp-app/tauri.conf.json`

- [ ] **Step 1: Update `build` block**

Set `build` to:

```json
  "build": {
    "beforeDevCommand": "npm --prefix frontend run dev",
    "devUrl": "http://localhost:1420",
    "beforeBuildCommand": "npm --prefix frontend run build",
    "frontendDist": "dist"
  },
```

- [ ] **Step 2: Remove `'unsafe-eval'` from the script-src CSP**

In `app.security.csp`, change the `script-src` directive from
`script-src 'self' 'unsafe-inline' 'unsafe-eval'` to
`script-src 'self' 'unsafe-inline'` (Vue templates are precompiled; no runtime
eval needed). Leave all other directives unchanged.

- [ ] **Step 3: Verify the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('coreamp-app/tauri.conf.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add coreamp-app/tauri.conf.json
git commit -m "build: point Tauri at Vite build and drop unsafe-eval from CSP"
```

---

## Task 10: Smoke-build the desktop app

**Files:** none (verification only).

> IMPORTANT: `tauri.conf.json` sets `devUrl: http://localhost:1420`. A **debug**
> binary loads the frontend from `devUrl` (the Vite dev server), NOT from
> `dist`. So launching `./target/debug/coreamp-app` without the dev server
> running shows a blank window with console error "Could not connect to the
> server. 1420". Use ONE of the two correct paths below.

- [ ] **Step 1a (dev path): start the Vite dev server, then launch the debug binary**

Run: `npm --prefix coreamp-app/frontend run dev > /tmp/vite_dev.log 2>&1 &`
Wait until `curl -s -o /dev/null http://localhost:1420` succeeds (~2s).
Then build (if needed) and launch: `cargo build -p coreamp-app && ./target/debug/coreamp-app > /tmp/coreamp_vue.log 2>&1 &`

- [ ] **Step 1b (release/shipping path, alternative): `cargo tauri build`**

`cargo tauri build` runs `beforeBuildCommand` (the Vite build into `dist`) and
the release binary serves `dist` directly — no dev server needed.

- [ ] **Step 2: Confirm the shell renders**

After ~7s screenshot with `screencapture -x /tmp/coreamp_vue.png` and open it.
Expected: window shows the VibeTabs bar (Home/Library/Liked/Playlists/Audio/Settings) and the transport footer with three buttons. Not a blank frame.

- [ ] **Step 3: Stop the app**

Run: `pkill -f coreamp-app`

- [ ] **Step 4: Record the milestone smoke result**

No commit (verification task). If the window is blank or the build fails, stop and debug before declaring the milestone done.

---

## Self-Review

**Spec coverage (Foundation portion):**
- Project layout / Vite→dist — Tasks 1, 9. ✓
- TS strict — Task 1 (tsconfig). ✓
- VibeUI + Pinia + Bootstrap CSS registration — Task 2. ✓
- Typed `api/tauri.ts` boundary + normalized `TauriError` (no silent swallow) — Task 4. ✓
- Pinia single source of truth + one-way flow — Tasks 5, 6. ✓
- H-A fix (no transient-status fall-through; never silent) — Task 6 (desync test). ✓
- H-B fix (`inFlight` lock, released in `finally`) — Task 6 (re-entrancy test). ✓
- Reactive icon binding replaces manual sync — Task 7. ✓
- vitest + Vue Test Utils, api mocked — Tasks 3, 4, 6, 7. ✓
- CSP drops `'unsafe-eval'` (S2) — Task 9. ✓
- `vue-tsc` typecheck in build/CI — Task 1 (build script). ✓
- Manual WKWebView smoke gate — Task 10. ✓
- Implementation Constraint (review VibeUI docs, prefer components) — called out in Tasks 7, 8 and the header. ✓

**Deferred to later milestones (correctly out of scope here):** visual parity styling, `Visualizer.vue`, `EqGraph.vue`, library/playlists/audio/settings views, `prevTrack`/`nextTrack` queue logic, deleting the legacy `dist/index.html` (cutover). The legacy file is intentionally left until the cutover milestone; Task 1's `emptyOutDir: true` regenerates `dist` on build, so do not hand-edit `dist` during this milestone.

**Type consistency:** `Source`, `Track`, `NativeStatus` defined once in `types.ts` (Task 4) and imported everywhere. `ToggleResult` defined in the store (Task 6) and asserted in its test. `usePlayerStore` name consistent across Tasks 6, 7, 8. API function names (`nativeAudioPause/Resume/Play/Stop/Status`) consistent across Tasks 4 and 6.

**Placeholder scan:** no TBD/TODO; every code step shows complete code; `Placeholder`/`HomePlaceholder` are real defined components, not stubs-as-placeholders.

**Note on `package-lock.json`:** generated by Step 1.9's install; commit it in Task 1 Step 11 (already listed).
