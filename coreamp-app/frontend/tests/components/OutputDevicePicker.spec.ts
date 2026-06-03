import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import OutputDevicePicker from "@/components/OutputDevicePicker.vue";
import { usePlayerStore } from "@/stores/player";

// Render the select as a real <option>-bearing element so we can assert on the
// option list and drive change events.
const stubs = {
  VibeFormSelect: {
    props: ["options", "modelValue"],
    emits: ["update:modelValue"],
    template: `<select data-test="output-device"
        :value="modelValue"
        @change="$emit('update:modelValue', $event.target.value)">
        <option v-for="o in options" :key="String(o.value)" :value="o.value">{{ o.text }}</option>
      </select>`,
  },
};

const dev = (name: string, is_default = false) => ({
  name,
  is_default,
  channels: 2,
  sample_rate_hz: 48000,
  sample_format: "f32",
});

describe("OutputDevicePicker", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("lists System default plus every device, flagging the default", async () => {
    const w = mount(OutputDevicePicker, { global: { stubs } });
    usePlayerStore().$patch({ outputDevices: [dev("Built-in", true), dev("DAC")] });
    await w.vm.$nextTick();
    const texts = w.findAll("option").map((o) => o.text());
    expect(texts).toEqual(["System default", "Built-in (default)", "DAC"]);
  });

  it("reflects the current selection", async () => {
    const w = mount(OutputDevicePicker, { global: { stubs } });
    usePlayerStore().$patch({
      outputDevices: [dev("DAC")],
      selectedOutputDevice: "DAC",
    });
    await w.vm.$nextTick();
    expect((w.get('select').element as HTMLSelectElement).value).toBe(
      "DAC",
    );
  });

  it("choosing a device routes to setOutputDevice with its name", async () => {
    const w = mount(OutputDevicePicker, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ outputDevices: [dev("DAC")] });
    const spy = vi.spyOn(player, "setOutputDevice").mockResolvedValue();
    await w.vm.$nextTick();
    const select = w.get('select');
    (select.element as HTMLSelectElement).value = "DAC";
    await select.trigger("change");
    expect(spy).toHaveBeenCalledWith("DAC");
  });

  it("choosing System default routes to setOutputDevice(null)", async () => {
    const w = mount(OutputDevicePicker, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ outputDevices: [dev("DAC")], selectedOutputDevice: "DAC" });
    const spy = vi.spyOn(player, "setOutputDevice").mockResolvedValue();
    await w.vm.$nextTick();
    const select = w.get('select');
    (select.element as HTMLSelectElement).value = "";
    await select.trigger("change");
    expect(spy).toHaveBeenCalledWith(null);
  });

  it("loads devices on mount", () => {
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "loadOutputDevices").mockResolvedValue();
    mount(OutputDevicePicker, { global: { stubs } });
    expect(spy).toHaveBeenCalledOnce();
  });
});
