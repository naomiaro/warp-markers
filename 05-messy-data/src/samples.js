// ===========================================================================
// samples.js -- pre-built textareas the user can load with one click.
//
// Each sample is a multiline string of one beat timestamp per line, the same
// format the textarea expects. They are deliberately synthetic so the demo
// runs without any audio files; the messy patterns mimic what a real
// beat_this run produces on a noisy recording.
// ===========================================================================

// Generate a steady-tempo list at `bpm` for `n` beats, optionally adding a
// uniform jitter of +/- `jitter` seconds to each timestamp. Jitter alone
// should NOT flag anomalies under the default thresholds -- a few ms of
// noise is normal in real detectors.
function steady(bpm, n, jitter = 0) {
  const secPerBeat = 60 / bpm;
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i * secPerBeat + (Math.random() * 2 - 1) * jitter;
    out.push(t.toFixed(4));
  }
  return out.join("\n");
}

// The interesting sample: 120 BPM with a small amount of jitter, ONE dropped
// beat around index 8 (its timestamp is missing, so the gap to index 9 is
// roughly doubled), and ONE doubled beat around index 14 (an extra timestamp
// is inserted, halving that gap). Both anomalies should be visible in the
// chart and flagged in the table.
export function jitteryWithAnomalies() {
  const secPerBeat = 0.5; // 120 BPM
  const jitter = 0.01;
  const out = [];
  let t = 0;
  for (let i = 0; i < 24; i++) {
    if (i === 8) {
      // skip this beat: simulate a dropped beat (the recorder doesn't emit
      // anything here, so the *next* timestamp is one beat-period further on)
      t += secPerBeat;
      continue;
    }
    out.push((t + (Math.random() * 2 - 1) * jitter).toFixed(4));
    t += secPerBeat;
    if (i === 14) {
      // insert a spurious extra timestamp halfway to the next "real" beat
      out.push((t - secPerBeat / 2 + (Math.random() * 2 - 1) * jitter).toFixed(4));
    }
  }
  return out.join("\n");
}

// A clean steady track. flagAnomalies should report nothing on this one
// with default thresholds -- it exists so the user can see the detector
// going quiet, which is just as instructive as seeing it go loud.
export function cleanSteady() {
  return steady(120, 24, 0.002);
}

// A deliberately broken sample where one timestamp goes backwards in
// seconds. The warp map cannot be inverted at that t; monotonicityHoles
// must catch it.
export function nonMonotonic() {
  const secPerBeat = 0.5;
  const out = [];
  for (let i = 0; i < 16; i++) {
    if (i === 6) {
      // Force this timestamp to be SMALLER than the previous one. Previous
      // (i=5) sits at 2.5 s; we put i=6 at 2.2 s -- the warp map's seconds
      // axis goes backwards here, so it stops being invertible.
      out.push((2.2).toFixed(4));
    } else {
      out.push((i * secPerBeat).toFixed(4));
    }
  }
  return out.join("\n");
}
