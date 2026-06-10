// ===========================================================================
// tone-source.js
//
// A synthetic SOURCE with pitch in it. Clicks would defeat this chapter's
// demo -- you cannot hear varispeed detune a click -- so the stand-in
// audio is a little arpeggio: at every file beat, a clean decaying tone,
// cycling C4 E4 G4 C5. Under varispeed the arpeggio audibly changes key
// with the rate; under granular stretch it does not. That contrast IS the
// chapter.
// ===========================================================================

const ARPEGGIO_HZ = [261.63, 329.63, 392.0, 523.25]; // C4 E4 G4 C5

// Render a buffer covering the file's beats, one tone per beat at its
// FILE second (this is source material -- the wobble is in it).
export function renderToneSource(ctx, fileMarkers) {
  const sr = ctx.sampleRate;
  const last = fileMarkers[fileMarkers.length - 1].second;
  const buf = ctx.createBuffer(1, Math.ceil((last + 1) * sr), sr);
  const data = buf.getChannelData(0);
  fileMarkers.forEach((m, i) => {
    const freq = ARPEGGIO_HZ[i % ARPEGGIO_HZ.length];
    const s0 = Math.round(m.second * sr);
    const len = Math.min(Math.floor(sr * 0.35), data.length - s0);
    for (let k = 0; k < len; k++) {
      const env = Math.exp(-k / (sr * 0.09));
      data[s0 + k] +=
        0.28 * env * Math.sin((2 * Math.PI * freq * k) / sr) +
        0.1 * env * Math.sin((2 * Math.PI * freq * 2 * k) / sr);
    }
  });
  return buf;
}
