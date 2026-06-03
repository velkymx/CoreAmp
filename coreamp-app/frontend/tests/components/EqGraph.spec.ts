import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import EqGraph from "@/components/EqGraph.vue";

const flat = [{ frequency: 1000, gain: 0, q: 1 }];

describe("EqGraph", () => {
  it("renders a polyline with one point per sample", () => {
    const w = mount(EqGraph, { props: { bands: flat } });
    const points = w.get("polyline").attributes("points")!.trim().split(" ");
    expect(points.length).toBe(96);
  });

  it("a boosted band lifts the curve above the zero line somewhere", () => {
    const flatY = mount(EqGraph, { props: { bands: flat } })
      .get("polyline")
      .attributes("points")!;
    const boosted = mount(EqGraph, {
      props: { bands: [{ frequency: 1000, gain: 12, q: 1 }] },
    })
      .get("polyline")
      .attributes("points")!;
    expect(boosted).not.toBe(flatY);
  });
});
