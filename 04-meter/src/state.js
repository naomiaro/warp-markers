// ===========================================================================
// state.js
//
// Builds the two layers the demo needs from the user's choices:
//
//   tempo layer  -- a piecewiseConstantMap from 01-the-math, anchored by a
//                   short warp-marker model the user can drag.
//   meter layer  -- a meterMap (array of {fromBeat, beatsPerBar} segments).
//
// Crucially, neither layer references the other. The metronome and the
// timeline view ask each layer the question it answers and combine the
// results visually -- they are never mixed up inside a single computation.
// ===========================================================================
import { piecewiseConstantMap } from "@warp-math/the-math/tempo-map.js";
import { pin } from "@warp-math/the-math/warp-marker.js";

// Sixteen beats is enough to hear three or four bars in 4/4 and to make a
// mid-sequence 4/4 -> 3/4 change land before the user loses interest.
export const N_BEATS = 16;

// The three meter presets the demo offers. fromBeat values are expressed in
// the 0..N_BEATS-1 indexing the rest of the demo uses; the mid-sequence
// preset starts in 4/4 and switches to 3/4 at beat 8 (the start of bar 3).
export const METER_PRESETS = {
  "4-4": [{ fromBeat: 0, beatsPerBar: 4 }],
  "3-4": [{ fromBeat: 0, beatsPerBar: 3 }],
  switch: [
    { fromBeat: 0, beatsPerBar: 4 },
    { fromBeat: 8, beatsPerBar: 3 },
  ],
};

// Build a fresh warp-marker model for the given constant BPM. Three markers:
// start, midpoint, and end. The midpoint is what the user drags; the other
// two anchor the timeline. Using three rather than two keeps the dragged
// segment local -- only beats between {0, mid} and {mid, end} get rescaled.
export function defaultWarpModel(bpm) {
  const secPerBeat = 60 / bpm;
  const mid = Math.floor(N_BEATS / 2);
  return [
    { beat: 0, second: 0 },
    { beat: mid, second: mid * secPerBeat },
    { beat: N_BEATS, second: N_BEATS * secPerBeat },
  ];
}

// Single render funnel. Given the UI state, return everything the views need.
// Note that the meterMap and the tempo map are computed completely in
// parallel from independent inputs -- exactly the point the demo is making.
export function snapshot(ui) {
  const meterMap = METER_PRESETS[ui.meterPreset];
  const model = ui.warpModel;
  const tempo = piecewiseConstantMap(model);
  return { meterMap, model, tempo };
}

// Attempt to re-pin a marker. Returns the new model, or null if pin() would
// make time non-monotonic (so the caller can snap back).
export function tryPin(model, beat, newSecond) {
  try {
    return pin(model, beat, newSecond);
  } catch {
    return null;
  }
}
