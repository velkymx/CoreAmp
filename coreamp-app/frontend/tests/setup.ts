import { config } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach } from "vitest";

beforeEach(() => {
  setActivePinia(createPinia());
});

// Register a fresh Pinia per test so stores are isolated.
config.global.plugins = [];
