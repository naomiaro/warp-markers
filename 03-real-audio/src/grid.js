// ===========================================================================
// grid.js
//
// Turn a parsed beat_this beat list into a tempo model the 01-the-math layer
// can consume, plus the metadata a UI needs to draw a musical grid on top of
// the audio (bar boundaries, pickup count).
//
// The math layer accepts a model whose first marker is at beat >= 1 (the
// FIRST beat in the file) and second > 0 (its audio time). The integration
// anchor (beta = 0, second = 0) is implicit; the math handles the gap from
// (0, 0) to the first marker. So no time-shift is needed -- the model's
// second axis is the AUDIO second axis directly.
//
// Pickup-beat offset (a musical decision, separate from the math):
//   In 4/4, a "bar" starts on a downbeat (beatInBar === 1). If the file
//   begins mid-bar -- say, with beatInBar 3, 4, 1, 2, ... -- the first two
//   rows are a PICKUP, the tail of a bar that began before the recording.
//   `pickupBeats` counts how many rows precede the first downbeat. Bar
//   boundaries land on `firstDownbeatBeatNumber, +4, +8, ...` -- in
//   1-indexed .beat values. The math layer doesn't know or care about bars;
//   this is purely so a UI can paint a thicker line at every downbeat.
// ===========================================================================
import { piecewiseConstantMap } from "@warp-math/the-math/tempo-map.js";

// Beats per bar. beat_this works on 4/4 by default; if a future variant
// emits triple meter the parser will start producing 1..3 cycles instead and
// we'd lift this. Kept as a constant so the assumption is searchable.
const BEATS_PER_BAR = 4;

// ---------------------------------------------------------------------------
// buildGrid(parsedBeats) -> {
//     map,             // the piecewiseConstantMap from 01-the-math
//     model,           // [{beat:1, second:t0}, {beat:2, second:t1}, ...]
//     pickupBeats,     // integer count of pickup beats before the first downbeat
//     barBoundaries,   // 1-indexed .beat values where a bar starts
//   }
//
// Beat numbering in `.beat` is 1-indexed (first beat is beat 1, matching
// beat_this's convention). Audio seconds are unchanged from the input.
// ---------------------------------------------------------------------------
export function buildGrid(parsedBeats) {
  if (parsedBeats.length < 2) {
    throw new Error("need at least two beats to derive a tempo");
  }

  // Model: 1-indexed beat numbers, audio seconds passed through unchanged.
  // The math layer's implicit (0, 0) -> first-marker segment provides the
  // lead-in tempo automatically.
  const model = parsedBeats.map((b, i) => ({
    beat: i + 1,
    second: b.second,
  }));

  // Pickup: find the array index of the first row tagged as a downbeat.
  // Everything before it is a pickup. If there is no downbeat at all we
  // treat pickup as zero -- the UI simply won't draw bar lines.
  const firstDownbeatIdx = parsedBeats.findIndex((b) => b.beatInBar === 1);
  const pickupBeats = firstDownbeatIdx < 0 ? 0 : firstDownbeatIdx;

  // Bar boundaries as 1-indexed .beat values. The first downbeat lives at
  // .beat = firstDownbeatIdx + 1 (model[firstDownbeatIdx].beat).
  const barBoundaries = [];
  if (firstDownbeatIdx >= 0) {
    for (let i = firstDownbeatIdx; i < model.length; i += BEATS_PER_BAR) {
      barBoundaries.push(model[i].beat);
    }
  }

  const map = piecewiseConstantMap(model);

  return { map, model, pickupBeats, barBoundaries };
}

// ---------------------------------------------------------------------------
// Coordinate conversions. With the new convention, model.second IS the audio
// second -- no shift required. The helpers below are kept as a thin layer so
// callers that round-trip through grids stay portable if the convention
// changes again.
// ---------------------------------------------------------------------------
export function audioSecToBeat(audioSec, grid) {
  return grid.map.secondsToBeats(audioSec);
}

export function beatToAudioSec(beat, grid) {
  return grid.map.beatsToSeconds(beat);
}
