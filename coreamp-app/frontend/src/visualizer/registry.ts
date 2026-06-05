import type { VisualizerPlugin } from "@/visualizer/types";
import { barsPlugin } from "@/visualizer/plugins/bars";
import { spectrumPlugin } from "@/visualizer/plugins/spectrum";
import { oscilloscopePlugin } from "@/visualizer/plugins/oscilloscope";

// All available visualizer plugins, in display order. New visual modes plug in
// here by implementing the VisualizerPlugin contract.
export const visualizerPlugins: VisualizerPlugin[] = [
  barsPlugin,
  spectrumPlugin,
  oscilloscopePlugin,
];

export function getPlugin(id: string): VisualizerPlugin {
  return visualizerPlugins.find((p) => p.id === id) ?? barsPlugin;
}
