import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import NotificationHost from "@/components/NotificationHost.vue";
import { useNotifyStore } from "@/stores/notify";

const stubs = { VibeIcon: { props: ["icon"], template: "<i></i>" } };

describe("NotificationHost", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("renders a toast per note with a kind class", async () => {
    const w = mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.error("disk gone");
    n.success("saved");
    await flushPromises();
    const toasts = w.findAll('[data-test="notify-toast"]');
    expect(toasts).toHaveLength(2);
    expect(toasts[0].classes()).toContain("notify-error");
    expect(toasts[1].classes()).toContain("notify-success");
  });

  it("dismiss button removes the toast", async () => {
    const w = mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.info("hi");
    await flushPromises();
    await w.get('[data-test="notify-dismiss"]').trigger("click");
    expect(n.notes).toHaveLength(0);
  });

  it("auto-dismisses an info note after the timeout", async () => {
    mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.info("temp");
    await flushPromises();
    expect(n.notes).toHaveLength(1);
    vi.advanceTimersByTime(6001);
    expect(n.notes).toHaveLength(0);
  });

  it("errors persist (never auto-dismiss) so they aren't missed", async () => {
    mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.error("bad");
    await flushPromises();
    vi.advanceTimersByTime(60_000);
    expect(n.notes).toHaveLength(1);
  });

  it("shows Clear all only when multiple notes are stacked, and clears them", async () => {
    const w = mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.error("a");
    await flushPromises();
    expect(w.find('[data-test="notify-clear-all"]').exists()).toBe(false);
    n.error("b");
    await flushPromises();
    expect(w.find('[data-test="notify-clear-all"]').exists()).toBe(true);
    await w.get('[data-test="notify-clear-all"]').trigger("click");
    expect(n.notes).toHaveLength(0);
  });

  it("copies an error's text to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const w = mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.error("disk gone");
    await flushPromises();
    await w.get('[data-test="notify-copy"]').trigger("click");
    expect(writeText).toHaveBeenCalledWith("disk gone");
    vi.unstubAllGlobals();
  });
});
