import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AudioView from "@/components/AudioView.vue";
import { useAudioStore } from "@/stores/audio";

vi.mock("@/api/tauri", () => ({
  nativeAudioSetDspSettings: vi.fn().mockResolvedValue(undefined),
}));

const stubs = {
  VibeFormSwitch: {
    props: ["modelValue", "label"],
    emits: ["update:modelValue"],
    template:
      '<label>{{ label }}<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /></label>',
  },
  VibeFormSelect: {
    props: ["modelValue", "options"],
    emits: ["update:modelValue"],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.text }}</option></select>',
  },
  VibeSlider: {
    props: ["modelValue", "min", "max", "step"],
    emits: ["update:modelValue"],
    template:
      '<input type="range" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  },
  VibeButton: { template: "<button><slot/></button>" },
  EqGraph: { props: ["bands"], template: '<svg data-test="eq-graph"></svg>' },
};

describe("AudioView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders five EQ band columns and the curve graph", () => {
    const w = mount(AudioView, { global: { stubs } });
    expect(w.findAll('[data-test="eq-band"]')).toHaveLength(5);
    expect(w.find('[data-test="eq-graph"]').exists()).toBe(true);
  });

  it("the boost button cycles the boost level", async () => {
    const w = mount(AudioView, { global: { stubs } });
    const audio = useAudioStore();
    expect(w.get('[data-test="boost"]').text()).toBe("Boost Off");
    await w.get('[data-test="boost"]').trigger("click");
    expect(audio.boostLevel).toBe(1);
  });

  it("dragging a gain slider updates that band", async () => {
    const w = mount(AudioView, { global: { stubs } });
    const audio = useAudioStore();
    const slider = w.get('[data-test="gain-0"]');
    (slider.element as HTMLInputElement).value = "6";
    await slider.trigger("input");
    expect(audio.bands[0].gain).toBe(6);
  });

  it("selecting a preset applies it", async () => {
    const w = mount(AudioView, { global: { stubs } });
    const audio = useAudioStore();
    const select = w.get('[data-test="eq-preset"]');
    (select.element as HTMLSelectElement).value = "Warm";
    await select.trigger("change");
    expect(audio.preset).toBe("Warm");
    expect(audio.eqEnabled).toBe(true);
  });
});
