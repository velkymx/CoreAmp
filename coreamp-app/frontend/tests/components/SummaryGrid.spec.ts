import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SummaryGrid from "@/components/SummaryGrid.vue";

const stubs = { VibeIcon: { props: ["icon"], template: "<i></i>" } };

const items = [
  { key: "Daft Punk", title: "Daft Punk", subtitle: "12 tracks" },
  { key: "Air", title: "Air", subtitle: "8 tracks" },
];

describe("SummaryGrid", () => {
  it("renders a card per item with its title and subtitle", () => {
    const w = mount(SummaryGrid, { props: { items }, global: { stubs } });
    const cards = w.findAll('[data-test="summary-card"]');
    expect(cards).toHaveLength(2);
    expect(cards[0].text()).toContain("Daft Punk");
    expect(cards[0].text()).toContain("12 tracks");
  });

  it("emits select with the item key on click", async () => {
    const w = mount(SummaryGrid, { props: { items }, global: { stubs } });
    await w.findAll('[data-test="summary-card"]')[1].trigger("click");
    expect(w.emitted("select")?.[0]).toEqual(["Air"]);
  });

  it("shows an empty state with no items", () => {
    const w = mount(SummaryGrid, { props: { items: [] }, global: { stubs } });
    expect(w.find('[data-test="summary-empty"]').exists()).toBe(true);
  });
});
