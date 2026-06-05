import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SleepTimer from "@/components/SleepTimer.vue";
import { usePlayerStore } from "@/stores/player";

const stubs = {
  VibeFormSelect: {
    props: ["modelValue", "options"],
    emits: ["update:modelValue"],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))">' +
      '<option v-for="o in options" :key="o.value" :value="o.value">{{ o.text }}</option>' +
      "</select>",
  },
};

describe("SleepTimer", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("arming a duration sets the sleep timer on the store", async () => {
    const w = mount(SleepTimer, { global: { stubs } });
    const player = usePlayerStore();
    const spy = vi.spyOn(player, "setSleepTimer");
    await w.get('[data-test="sleep-select"]').setValue("30");
    expect(spy).toHaveBeenCalledWith(30);
  });

  it("shows a remaining countdown while the timer is armed", async () => {
    const w = mount(SleepTimer, { global: { stubs } });
    const player = usePlayerStore();
    player.$patch({ sleepEndsAt: Date.now() + 90_000 });
    await w.vm.$nextTick();
    const text = w.get('[data-test="sleep-remaining"]').text();
    expect(text).toMatch(/^1:[0-5]\d$/);
  });

  it("hides the countdown when no timer is armed", () => {
    const w = mount(SleepTimer, { global: { stubs } });
    expect(w.find('[data-test="sleep-remaining"]').exists()).toBe(false);
  });
});
