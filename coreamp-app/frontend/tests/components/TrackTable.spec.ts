import { describe, it, expect } from "vitest";
import { h } from "vue";
import { mount } from "@vue/test-utils";
import TrackTable from "@/components/TrackTable.vue";
import type { LibraryTrack } from "@/types";

// Minimal VibeDataTable stand-in: renders each item's cell slots and emits
// row-clicked, so we can exercise TrackTable's slots and events.
const VibeDataTable = {
  props: ["items", "columns"],
  emits: ["row-clicked"],
  setup(props: any, { slots, emit }: any) {
    return () =>
      h(
        "table",
        {},
        props.items.map((item: LibraryTrack, i: number) =>
          h(
            "tr",
            { "data-test": "track-row", onClick: () => emit("row-clicked", item, i) },
            props.columns.map((col: any) => {
              const slot = slots[`cell(${col.key})`];
              return h(
                "td",
                {},
                slot
                  ? slot({ item, value: (item as any)[col.key], index: i })
                  : String((item as any)[col.key] ?? ""),
              );
            }),
          ),
        ),
      );
  },
};

const stubs = {
  VibeDataTable,
  VibeButton: { template: "<button><slot/></button>" },
  VibeIcon: { props: ["icon"], template: '<i :data-icon="icon"></i>' },
  AlbumArt: { props: ["path", "size"], template: '<i data-test="album-art"></i>' },
};

const row = (over: Partial<LibraryTrack> = {}): LibraryTrack => ({
  path: "/m/a.mp3",
  filename: "a.mp3",
  artist: "Artist",
  album: "Album",
  album_artist: null,
  title: "Title",
  year: "2020",
  genre: "Rock",
  liked: false,
  duration: 200,
  ...over,
});

describe("TrackTable (VibeDataTable)", () => {
  it("renders a cell per track with title (filename fallback)", () => {
    const w = mount(TrackTable, {
      props: { tracks: [row({ title: null })] },
      global: { stubs },
    });
    expect(w.get('[data-test="track-title"]').text()).toBe("a.mp3");
  });

  it("clicking a row emits play with the track", async () => {
    const w = mount(TrackTable, {
      props: { tracks: [row(), row({ path: "/m/b.mp3" })] },
      global: { stubs },
    });
    await w.findAll('[data-test="track-row"]')[1].trigger("click");
    expect(w.emitted("play")?.[0][0]).toMatchObject({ path: "/m/b.mp3" });
  });

  it("the heart emits like with the path and not play", async () => {
    const w = mount(TrackTable, { props: { tracks: [row()] }, global: { stubs } });
    await w.get('[data-test="track-like"]').trigger("click");
    expect(w.emitted("like")?.[0]).toEqual(["/m/a.mp3"]);
    expect(w.emitted("play")).toBeUndefined();
  });

  it("artist and album emit browse", async () => {
    const w = mount(TrackTable, { props: { tracks: [row()] }, global: { stubs } });
    await w.get('[data-test="track-artist"]').trigger("click");
    expect(w.emitted("browse")?.[0]).toEqual(["Artist"]);
    await w.get('[data-test="track-album"]').trigger("click");
    expect(w.emitted("browse")?.[1]).toEqual(["Album"]);
  });

  it("the row menu emits play-next / enqueue / add-to-playlist / edit", async () => {
    const w = mount(TrackTable, { props: { tracks: [row()] }, global: { stubs } });
    await w.get('[data-test="track-menu"]').trigger("click");
    await w.get('[data-test="menu-play-here"]').trigger("click");
    expect(w.emitted("play-from-here")?.[0][0]).toMatchObject({ path: "/m/a.mp3" });

    await w.get('[data-test="track-menu"]').trigger("click");
    await w.get('[data-test="menu-play-next"]').trigger("click");
    expect(w.emitted("play-next")?.[0][0]).toMatchObject({ path: "/m/a.mp3" });

    await w.get('[data-test="track-menu"]').trigger("click");
    await w.get('[data-test="menu-queue"]').trigger("click");
    expect(w.emitted("enqueue")?.[0][0]).toMatchObject({ path: "/m/a.mp3" });

    await w.get('[data-test="track-menu"]').trigger("click");
    await w.get('[data-test="menu-add-playlist"]').trigger("click");
    expect(w.emitted("add-to-playlist")?.[0][0]).toMatchObject({ path: "/m/a.mp3" });

    await w.get('[data-test="track-menu"]').trigger("click");
    await w.get('[data-test="menu-edit"]').trigger("click");
    expect(w.emitted("edit")?.[0][0]).toMatchObject({ path: "/m/a.mp3" });
  });

  it("marks the active row with a play marker", () => {
    const w = mount(TrackTable, {
      props: { tracks: [row()], activePath: "/m/a.mp3" },
      global: { stubs },
    });
    expect(w.text()).toContain("▶");
  });

  it("shows an empty state when there are no tracks", () => {
    const w = mount(TrackTable, { props: { tracks: [] }, global: { stubs } });
    expect(w.find('[data-test="track-empty"]').exists()).toBe(true);
  });
});
