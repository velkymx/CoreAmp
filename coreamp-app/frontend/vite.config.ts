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
    // Hidden sourcemaps ship with the bundle for stack-trace symbolication
    // without exposing the original source in the deployed files. Pair with
    // a Sentry / error-reporter uploader once one is in place.
    sourcemap: "hidden",
    target: "es2022",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Split vendor + app into separate chunks so the heavy 3rd-party
        // bundles (Vue runtime, Pinia, VibeUI) are cached independently of
        // app code. Rolldown requires `manualChunks` to be a function; we
        // match by node_modules path. Returns a chunk name string per id.
        manualChunks(id: string): string | undefined {
          if (id.includes("node_modules/vue/") || id.includes("node_modules/@vue/")) {
            return "vue";
          }
          if (id.includes("node_modules/pinia/")) {
            return "pinia";
          }
          if (id.includes("node_modules/@velkymx/vibeui/")) {
            return "vibeui";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
});
