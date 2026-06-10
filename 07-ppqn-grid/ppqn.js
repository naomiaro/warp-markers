// =====================================================================
// 07 · Lining up on the PPQN grid
// =====================================================================
//
// Chapter 01 gave us the only piece of calculus a DAW timeline needs:
//
//     time(B) = integral from 0 to B of 60 / BPM(beta) dbeta
//
// and wrapped it in maps with two methods, `beatsToSeconds(beta)` and
// `secondsToBeats(second)`. This chapter adds nothing to that math.
// Instead it shows that the tick grid every DAW schedules on — the
// "PPQN" grid — is just a renaming of the beat axis, so every grid
// question is already answered by the chapter-01 map. The payoff at the
// bottom of the file: warping an audio file so its beats land exactly
// on a project's grid is two compositions of that same map.
//
// ---------------------------------------------------------------------
// Number systems (the repo-wide agreement, now with a fourth member)
// ---------------------------------------------------------------------
//
// This repo is fanatical about which number system a value lives in,
// because off-by-one bugs in beat math are really off-by-one-SYSTEM
// bugs. The four systems in play in this file:
//
//   1. Array index   — 0-based integer. `markers[0]` is the first marker.
//   2. `.beat` field — 1-based integer. Beat maps never contain a beat 0;
//                      the first marker is `{ beat: 1, ... }`.
//   3. beta          — the continuous integration variable from chapter
//                      01. beta = 0 is the anchor *before* any beat;
//                      beat n lives at beta = n. beta takes fractional
//                      values freely (beta = 2.5 is halfway between
//                      beats 2 and 3).
//   4. tick          — NEW in this chapter. A 0-based integer. Tick 0 is
//                      anchored at beat 1 — the position a DAW displays
//                      as 1.1.0. Ticks are integers BY DEFINITION; that
//                      is the entire point of PPQN (see below). Never
//                      confuse a tick with an array index (both 0-based,
//                      totally unrelated), with a `.beat` (1-based), or
//                      with beta (continuous).
//
// Keep those four straight and everything in this file is one-line
// arithmetic.

import { segmentBpm } from "@warp-math/the-math/tempo-map.js";

// ---------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------

function assertPpqn(ppqn) {
  if (!Number.isInteger(ppqn) || ppqn <= 0) {
    throw new Error(
      `ppqn must be a positive integer (e.g. 96, 480, 960), got ${ppqn}`
    );
  }
}

function assertMap(map) {
  if (
    map === null ||
    typeof map !== "object" ||
    typeof map.beatsToSeconds !== "function" ||
    typeof map.secondsToBeats !== "function"
  ) {
    throw new Error(
      "map must be a tempo map exposing beatsToSeconds(beta) and secondsToBeats(second)"
    );
  }
}

function assertMarkers(markers, minimum, fnName) {
  if (!Array.isArray(markers) || markers.length < minimum) {
    throw new Error(
      `${fnName} requires an array of at least ${minimum} marker(s), got ` +
        (Array.isArray(markers) ? `${markers.length}` : `${markers}`)
    );
  }
  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    if (
      m === null ||
      typeof m !== "object" ||
      !Number.isFinite(m.beat) ||
      !Number.isFinite(m.second)
    ) {
      throw new Error(
        `${fnName}: marker at index ${i} must be { beat, second } with finite numbers`
      );
    }
    if (i > 0) {
      if (m.beat <= markers[i - 1].beat) {
        throw new Error(
          `${fnName}: marker .beat values must be strictly increasing ` +
            `(index ${i - 1} has beat ${markers[i - 1].beat}, index ${i} has beat ${m.beat})`
        );
      }
      if (m.second <= markers[i - 1].second) {
        throw new Error(
          `${fnName}: marker .second values must be strictly increasing ` +
            `(index ${i - 1} at ${markers[i - 1].second}s, index ${i} at ${m.second}s)`
        );
      }
    }
  }
}

function assertProjectBpm(projectBpm) {
  if (!Number.isFinite(projectBpm) || projectBpm <= 0) {
    throw new Error(`projectBpm must be a positive finite number, got ${projectBpm}`);
  }
}

// =====================================================================
// 1. Tick <-> beta — the whole chapter in one formula
// =====================================================================

// <doc id="ppqn-intro">
// A DAW does not schedule MIDI notes in seconds, and it does not
// schedule them in beats either. It schedules them in ticks. PPQN —
// pulses per quarter note — fixes an integer resolution (96, 480 and
// 960 are common), and every event gets an integer tick count. In this
// repo a beat IS a quarter note, so PPQN ticks divide one beat into
// PPQN equal slices. A tick is therefore nothing more exotic than a
// fractional beat with the fraction's denominator agreed on in advance:
//
//     tick / PPQN = beats since the grid origin
//
// The only subtlety is WHERE the grid origin sits, and it is a
// number-system subtlety. Ticks are 0-based: the first schedulable
// position is tick 0, which a DAW displays as 1.1.0 — bar 1, beat 1,
// tick 0. But in this repo's beat maps, beat 1 lives at beta = 1, not
// at beta = 0. The interval beta in [0, 1) is the map's implicit
// lead-in — the run-up BEFORE the first beat, before the grid begins.
// Tick 0 must therefore land on beta = 1, which forces a "+ 1" into the
// conversion:
//
//     beta(tick) = tick / PPQN + 1
//
// Check it at the anchors: tick 0 gives beta = 1 (the first beat,
// DAW position 1.1.0), and tick = PPQN gives beta = 2 (the second
// beat). Half a beat past beat 3 at PPQN 96 is tick 240:
//
//     beta(240) = 240 / 96 + 1 = 2.5 + 1 = 3.5
//
// Inverting is one step of algebra — subtract the anchor, scale by the
// resolution:
//
//     tick(beta) = (beta - 1) * PPQN
//
// Note the asymmetry between the two directions. beta is continuous, so
// beta(tick) accepts any integer tick and tick(beta) accepts any beta —
// but tick(beta) returns a FLOAT. beta = 2.25 at PPQN 96 is tick 120
// exactly; beta = 2.3 is tick 124.8, which is not a tick at all.
// Turning that float into an integer is a policy decision (round?
// floor?) that belongs to the caller, not to this conversion — see
// nearestTick below.
//
// RULE (tick anchor): beta(tick) = tick / PPQN + 1
// </doc>

/**
 * Convert an integer tick on a PPQN grid to a continuous beat position.
 * Tick 0 is anchored at beat 1 (DAW position 1.1.0), hence the + 1.
 *
 * Ticks are integers by definition — that is the whole point of PPQN —
 * so a fractional tick is rejected rather than silently accepted.
 * (beta, by contrast, takes fractional values freely.)
 */
export function betaForTick(tick, ppqn) {
  assertPpqn(ppqn);
  if (!Number.isInteger(tick)) {
    throw new Error(
      `tick must be an integer — ticks are integer subdivisions by definition; got ${tick}`
    );
  }
  if (tick < 0) {
    throw new Error(
      `tick must be >= 0 — tick 0 is the grid origin (beat 1, DAW 1.1.0); got ${tick}`
    );
  }
  return tick / ppqn + 1;
}

/**
 * Convert a continuous beat position to a (float) tick count.
 * Exact inverse of betaForTick. The result is generally NOT an integer;
 * quantizing it is the caller's decision (see nearestTick).
 */
export function tickForBeta(beta, ppqn) {
  assertPpqn(ppqn);
  if (!Number.isFinite(beta) || beta < 0) {
    throw new Error(`beta must be a finite number >= 0, got ${beta}`);
  }
  return (beta - 1) * ppqn;
}

// =====================================================================
// 2. Tick <-> second — composition, not new math
// =====================================================================
//
// There is deliberately nothing to derive here. A tick names a beat
// position (section 1); a tempo map converts beat positions to seconds
// (chapter 01). Composing the two answers the question every sequencer
// asks on every scheduled event: "when, in seconds, does tick t sound?"
//
//     tickToSecond = beatsToSeconds . betaForTick
//     secondToTick = tickForBeta . secondsToBeats
//
// Worked number, used again in the tests: PPQN 96, tick 240.
//
//     beta = 240 / 96 + 1 = 3.5
//
// On constantMap(120), one beat lasts 60 / 120 = 0.5 seconds, so
//
//     second = 0.5 * 3.5 = 1.75
//
// Note that the lead-in is included: beta = 3.5 is 3.5 beats of map
// time from beta = 0, even though only 2.5 beats of GRID have elapsed
// since tick 0. The map owns time; the grid merely names positions.

/**
 * Seconds at which integer tick `tick` falls, under tempo map `map`.
 */
export function tickToSecond(tick, ppqn, map) {
  assertMap(map);
  return map.beatsToSeconds(betaForTick(tick, ppqn));
}

/**
 * (Float) tick count at time `second`, under tempo map `map`.
 * Returns a float for the same reason tickForBeta does.
 */
export function secondToTick(second, ppqn, map) {
  assertMap(map);
  assertPpqn(ppqn);
  return tickForBeta(map.secondsToBeats(second), ppqn);
}

// =====================================================================
// 3. Quantize — round versus floor are different questions
// =====================================================================
//
// secondToTick hands back a float like 239.616. Two legitimate ways to
// make it an integer, answering two DIFFERENT questions:
//
//   Math.round — "which tick is NEAREST?" This is snapping: a note
//     played 4 milliseconds early should land on the gridline it was
//     aimed at, whether it arrived just before or just after.
//
//   Math.floor — "which grid CELL am I in?" This is bucketing: for
//     display ("we are in bar 3, beat 2") or for accumulating events
//     per slice, a position 99% of the way to the next tick still
//     belongs to the cell it is inside.
//
// Snapping a recorded performance wants round; painting a playhead
// wants floor. We export the snapping one because it is the one the
// warp workflow below needs; floor is a one-character edit if you need
// the other question answered.

/**
 * The integer tick nearest to time `second` under map `map`. Snapping.
 */
export function nearestTick(second, ppqn, map) {
  return Math.round(secondToTick(second, ppqn, map));
}

// =====================================================================
// 4. The payoff — warping a file onto a project grid
// =====================================================================
//
// The situation every DAW user knows: an audio file whose internal
// tempo wobbles (its beat tracker produced markers — chapter 05), and a
// project with a rigid grid (usually a constant BPM). "Warping" the
// file means time-stretching it so that file beat n SOUNDS at project
// beat n.
//
// Two tempo maps describe the two sides:
//
//   the FILE's map     piecewiseConstantMap(fileMarkers)  — where each
//                      beat actually lives in the source audio
//   the PROJECT's grid constantMap(projectBpm)            — where each
//                      beat must end up
//
// Both maps share the same beat axis, so pairing them is just
// evaluating both at the same beat. For marker beat n:
//
//     fileSecond    = marker.second
//     projectSecond = (60 / projectBpm) * marker.beat
//
// (the second line is constantMap(projectBpm).beatsToSeconds evaluated
// at beta = marker.beat — written out because it is one multiplication).
// That pairing table is exactly what a DAW persists for a warped clip.

/**
 * Pair every file marker with its destination on the project grid.
 * Pure data: [{ beat, fileSecond, projectSecond }, ...], one entry per
 * marker. A single marker is fine — one pin is a valid (if trivial)
 * alignment.
 */
export function alignBeats(fileMarkers, projectBpm) {
  assertMarkers(fileMarkers, 1, "alignBeats");
  assertProjectBpm(projectBpm);
  const projectSecondsPerBeat = 60 / projectBpm;
  return fileMarkers.map((marker) => ({
    beat: marker.beat,
    fileSecond: marker.second,
    projectSecond: projectSecondsPerBeat * marker.beat,
  }));
}

// ---------------------------------------------------------------------
// How fast must each stretch play? The warp rate.
// ---------------------------------------------------------------------
//
// Between two adjacent markers the file's tempo is a constant
// segmentBpm (chapter 01's two-point formula — imported, not
// reimplemented). Over that segment:
//
//     the file supplies  60 / segmentBpm  source-seconds per beat
//     the project allots 60 / projectBpm  timeline-seconds per beat
//
// The playback rate is how many source-seconds must be consumed per
// timeline-second, i.e. the ratio of the two:
//
//     rate = sourceSecondsPerBeat / projectSecondsPerBeat
//          = (60 / segmentBpm) / (60 / projectBpm)
//
// The 60s cancel and the fraction flips:
//
// RULE (warp rate): rate = sourceSecondsPerBeat / projectSecondsPerBeat = projectBpm / segmentBpm
//
// Sanity-check the direction: a segment recorded at 100 BPM is SLOWER
// than a 120 BPM project, so it must play FASTER to keep up —
// rate = 120 / 100 = 1.2 > 1. rate > 1 always means "play the source
// faster". rate is just a number here; actually resampling audio at
// that rate is playback's problem (chapter 03), not this chapter's.

/**
 * The playback rate for each segment between adjacent file markers,
 * against a constant project grid.
 * Returns [{ fromBeat, toBeat, rate }, ...], one entry per segment —
 * which is why at least 2 markers are required: zero markers pin
 * nothing, and one marker pins a point but bounds no segment.
 */
export function segmentRates(fileMarkers, projectBpm) {
  assertMarkers(fileMarkers, 2, "segmentRates");
  assertProjectBpm(projectBpm);
  const rates = [];
  for (let i = 0; i < fileMarkers.length - 1; i++) {
    const a = fileMarkers[i];
    const b = fileMarkers[i + 1];
    rates.push({
      fromBeat: a.beat,
      toBeat: b.beat,
      rate: projectBpm / segmentBpm(a, b),
    });
  }
  return rates;
}
