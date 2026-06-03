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

  it("keeps an error note longer than an info note", async () => {
    mount(NotificationHost, { global: { stubs } });
    const n = useNotifyStore();
    n.error("bad");
    await flushPromises();
    vi.advanceTimersByTime(6001);
    expect(n.notes).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(n.notes).toHaveLength(0);
  });
});
