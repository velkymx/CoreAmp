import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TrackTable from "@/components/TrackTable.vue";

const stubs = {
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
  VibeButton: { template: "<button><slot/></button>" },
};

const row = (over = {}) => ({
  path: "/m/a.mp3",
  filename: "a.mp3",
  artist: "Artist",
  album: "Album",
  title: "Title",
  year: "2020",
  genre: "Rock",
  liked: false,
  duration: 200,
  ...over,
});

describe("TrackTable", () => {
  it("renders a row per track with title, artist, album, duration", () => {
    const w = mount(TrackTable, { props: { tracks: [row()] }, global: { stubs } });
    expect(w.findAll('[data-test="track-row"]')).toHaveLength(1);
    expect(w.text()).toContain("Title");
    expect(w.text()).toContain("Artist");
    expect(w.text()).toContain("Album");
    expect(w.text()).toContain("3:20");
  });

  it("falls back to the file name when title is missing", () => {
    const w = mount(TrackTable, {
      props: { tracks: [row({ title: null })] },
      global: { stubs },
    });
    expect(w.get('[data-test="track-title"]').text()).toBe("a.mp3");
  });

  it("emits play with the row index on row click", async () => {
    const w = mount(TrackTable, {
      props: { tracks: [row(), row({ path: "/m/b.mp3" })] },
      global: { stubs },
    });
    await w.findAll('[data-test="track-row"]')[1].trigger("click");
    expect(w.emitted("play")?.[0]).toEqual([1]);
  });

  it("emits like with the path when the heart is clicked, without emitting play", async () => {
    const w = mount(TrackTable, { props: { tracks: [row()] }, global: { stubs } });
    await w.get('[data-test="track-like"]').trigger("click");
    expect(w.emitted("like")?.[0]).toEqual(["/m/a.mp3"]);
    expect(w.emitted("play")).toBeUndefined();
  });

  it("marks the active row", () => {
    const w = mount(TrackTable, {
      props: { tracks: [row(), row({ path: "/m/b.mp3" })], activePath: "/m/b.mp3" },
      global: { stubs },
    });
    const rows = w.findAll('[data-test="track-row"]');
    expect(rows[1].classes()).toContain("is-active");
    expect(rows[0].classes()).not.toContain("is-active");
  });

  it("shows an empty state when there are no tracks", () => {
    const w = mount(TrackTable, { props: { tracks: [] }, global: { stubs } });
    expect(w.find('[data-test="track-empty"]').exists()).toBe(true);
  });
});
