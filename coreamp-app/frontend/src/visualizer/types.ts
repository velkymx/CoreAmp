// One frame of analysis data handed to a visualizer plugin each render tick.
export interface VizFrame {
  freq: Uint8Array; // byte frequency data (0..255)
  wave: Uint8Array; // byte time-domain data (0..255)
  t: number; // timestamp ms (for idle animation)
  active: boolean; // true when real audio data is flowing
}

// A drawable visualizer. Plugins are pure-ish: given a 2D context, the canvas
// size and a frame of data, paint one frame. No external state required.
export interface VisualizerPlugin {
  id: string;
  label: string;
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, frame: VizFrame): void;
}
