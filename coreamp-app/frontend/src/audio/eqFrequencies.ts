// Centre frequencies for the graphic EQ, shared by the audio store (UI + DSP
// payload) and the Web Audio driver (one biquad per frequency). 10-band ISO
// octave layout (31 Hz … 16 kHz).
export const EQ_FREQUENCIES = [
  31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;
