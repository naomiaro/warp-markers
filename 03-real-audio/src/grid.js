// ===========================================================================
// grid.js
//
// Turn a parsed beat_this beat list into a tempo model the 01-the-math layer
// can consume, plus the metadata a UI needs to draw a musical grid on top of
// the audio (bar boundaries, pickup count).
//
// Two coordinate decisions live here, and they are kept clearly separate
// because they answer different questions:
//
//   1. TIME SHIFT (forced by the math API).
//      01-the-math requires the marker model to start at {beat:0, second:0}.
//      Real .beats files almost never start exactly at 0 s, so we subtract
//      `beats[0].second` from every entry before building the model. The
//      audio file's second-axis is unchanged -- we just remember the offset
//      and apply it whenever we round-trip between "audio seconds" and
//      "model seconds".
//
//   2. PICKUP-BEAT OFFSET (a musical decision).
//      In 4/4, a "bar" starts on a downbeat (beatInBar === 1). If the file
//      begins mid-bar -- say, with beatInBar 3, 4, 1, 2, ... -- the first
//      two rows are a PICKUP, the tail of a bar that began before the
//      recording. Our model numbers beats 0, 1, 2, ... so bar boundaries
//      land on multiples of 4 only if the pickup count is folded in:
//
//          firstDownbeatIndex = index in the .beats file where beatInBar === 1
//          pickupBeats        = firstDownbeatIndex
//          barBoundaryBeats   = { pickupBeats, pickupBeats + 4, pickupBeats + 8, ... }
//
//      The math layer doesn't know or care about bars -- this is purely so
//      a UI can paint a thicker line at every downbeat.
// ===========================================================================
import { piecewiseConstantMap } from "@warp-math/the-math/tempo-map.js";

// Beats per bar. beat_this works on 4/4 by default; if a future variant
// emits triple meter the parser will start producing 1..3 cycles instead and
// we'd lift this. Kept as a constant so the assumption is searchable.
const BEATS_PER_BAR = 4;

// ---------------------------------------------------------------------------
// buildGrid(parsedBeats) -> {
//     map,             // the piecewiseConstantMap from 01-the-math
//     model,           // [{beat, second}, ...] starting at {0, 0}
//     audioOffsetSec,  // beats[0].second -- add this to model seconds to get
//                      // audio-clock seconds, and subtract to go the other way
//     pickupBeats,     // integer count of pickup beats before the first downbeat
//     barBoundaries,   // array of model-beat values where a bar starts
//   }
// ---------------------------------------------------------------------------
export function buildGrid(parsedBeats) {
  if (parsedBeats.length < 2) {
    throw new Error("need at least two beats to derive a tempo");
  }

  const audioOffsetSec = parsedBeats[0].second;

  // Build markers in MODEL coordinates: time starts at 0, beats start at 0.
  const model = parsedBeats.map((b, i) => ({
    beat: i,
    second: b.second - audioOffsetSec,
  }));

  // Pickup: find the index of the first row tagged as a downbeat. Everything
  // before it is a pickup. If there is no downbeat at all we treat pickup as
  // zero -- the user's grid simply won't show bar lines.
  const firstDownbeatIdx = parsedBeats.findIndex((b) => b.beatInBar === 1);
  const pickupBeats = firstDownbeatIdx < 0 ? 0 : firstDownbeatIdx;

  // Bar boundaries in MODEL beat coordinates. We just walk forward from the
  // first downbeat in steps of BEATS_PER_BAR. (We don't try to extrapolate
  // past the last beat in the file -- the grid only exists where data does.)
  const barBoundaries = [];
  if (firstDownbeatIdx >= 0) {
    for (let b = pickupBeats; b < model.length; b += BEATS_PER_BAR) {
      barBoundaries.push(b);
    }
  }

  const map = piecewiseConstantMap(model);

  return { map, model, audioOffsetSec, pickupBeats, barBoundaries };
}

// ---------------------------------------------------------------------------
// Coordinate conversions. The map functions all live in MODEL seconds, so
// every conversion to/from the audio clock funnels through these helpers.
// ---------------------------------------------------------------------------
export function audioSecToModelSec(audioSec, audioOffsetSec) {
  return audioSec - audioOffsetSec;
}
export function modelSecToAudioSec(modelSec, audioOffsetSec) {
  return modelSec + audioOffsetSec;
}

// Convenience: an audio-clock second -> a beat number, going through the map.
export function audioSecToBeat(audioSec, grid) {
  return grid.map.secondsToBeats(audioSecToModelSec(audioSec, grid.audioOffsetSec));
}

// And the inverse: a beat number -> audio-clock second.
export function beatToAudioSec(beat, grid) {
  return modelSecToAudioSec(grid.map.beatsToSeconds(beat), grid.audioOffsetSec);
}
