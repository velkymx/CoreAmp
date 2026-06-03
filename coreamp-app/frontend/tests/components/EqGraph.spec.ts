import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EqGraph from "@/components/EqGraph.vue";

const flat = [{ frequency: 1000, gain: 0, q: 1 }];

describe("EqGraph", () => {
  it("renders a canvas", () => {
    const w = mount(EqGraph, { props: { bands: flat } });
    expect(w.find("canvas").exists()).toBe(true);
  });

  it("mounts with live frequency data without throwing", () => {
    const freq = new Uint8Array(1024).fill(120);
    expect(() =>
      mount(EqGraph, { props: { bands: flat, freq } }),
    ).not.toThrow();
  });
});
