// =====================================================================
// 09 · Stretching time without bending pitch
// =====================================================================
//
// Chapter 07 ended on a confession. `segmentRates` computed, for every
// segment of a wobbly file, the rate that segment must play at to land
// its beats on the project grid — and then chapter 07 fed those rates
// to `playbackRate`, which is VARISPEED: the tape-machine trick of
// spinning the reel faster. Rate 1.2 plays the segment 20% faster and
// raises every frequency in it by 20%, about +3.2 semitones. The beats
// land; the song changes key. Chapter 08 dodged the problem by
// inverting the direction — bend the GRID to the file and touch no
// audio at all.
//
// This chapter closes the triptych: change the timing WITHOUT changing
// the pitch. The engine is GRANULAR OVERLAP-ADD — chop the source into
// short grains, play each grain at its natural pitch (rate 1.0,
// untouched), and hide the seams under a window function. And the
// thesis of the chapter, the reason it belongs in this repo at all, is
// that the warp math does not change. The same anchors, the same
// per-segment rates that chapter 07 computed, drive this engine too.
// Varispeed PLAYS the warp function; granular SAMPLES it. Same math,
// different engine.
//
// Nothing in this file touches Web Audio. It is the scheduling math
// only — pure functions over numbers — which is exactly what makes it
// testable in Node. The grain player that turns this schedule into
// sound is integrated in the repo afterward.
//
// House rules, as everywhere in this repo: pure functions, inputs are
// never mutated, beat numbers are 1-indexed, array indices are
// 0-based, and the two are never conflated.

import { alignBeats, segmentRates } from "@warp-math/ppqn-grid/ppqn.js";

// ---------------------------------------------------------------------
// The plan: chapter 07's tables, verbatim
// ---------------------------------------------------------------------
//
// Everything granular needs was already computed in chapter 07:
//
//   anchors — `alignBeats(fileMarkers, projectBpm)`: one row per beat,
//             { beat, fileSecond, projectSecond }. The pairing table —
//             WHERE each file moment must sound on the project clock.
//   rates   — `segmentRates(fileMarkers, projectBpm)`: one row per
//             segment, { fromBeat, toBeat, rate }, with
//             rate = projectBpm / segmentBpm = source seconds consumed
//             per project second on that segment.
//
// `stretchPlan` just calls both and bundles the results. It adds no
// validation of its own: `alignBeats` and `segmentRates` already
// reject malformed marker arrays (fewer than 2 markers, non-increasing
// beats or seconds, bad BPM), and their errors bubble up unchanged.

/**
 * Bundle chapter 07's pairing table and per-segment rates into the
 * plan that every other function in this module consumes.
 *
 * @param {Array<{beat: number, second: number}>} fileMarkers
 *   1-indexed, strictly increasing beats; strictly increasing seconds.
 * @param {number} projectBpm
 * @returns {{ anchors: Array, rates: Array, projectBpm: number }}
 */
export function stretchPlan(fileMarkers, projectBpm) {
  return {
    anchors: alignBeats(fileMarkers, projectBpm),
    rates: segmentRates(fileMarkers, projectBpm),
    projectBpm,
  };
}

// <doc id="granular-intro">
// Playback runs on the PROJECT clock. Call its time p — output time,
// the seconds a listener experiences. The one function this chapter
// revolves around is the SOURCE-POSITION function s(p): which second
// of the FILE should be sounding at output time p.
//
// Chapter 07's pairing table pins it down at every beat — anchor n
// says that file moment fileSecond_n must sound at project moment
// projectSecond_n — and between anchors the file is consumed at the
// segment's constant rate (source seconds per project second). A known
// value at the left edge plus a constant slope is a line, so s is
// piecewise-linear:
//
//     s(p) = fileSecond_n + rate_n * (p - projectSecond_n)
//
//     for p in [projectSecond_n, projectSecond_n+1)
//
// Chapter 07's varispeed engine plays the source THROUGH this
// function: the audio hardware traces s(p) continuously, and pitch
// scales with the slope — that is the whole pitch problem, dressed as
// calculus. Slope 1.2 means every waveform in the segment is traversed
// 20% faster, so every period shortens by 20%, so everything sounds a
// fifth of an octave sharp-ward.
//
// Granular synthesis refuses to trace the function. It SAMPLES it.
// Grains — slices of source a few hundredths of a second long — are
// laid out at regular hops on the output clock, and each grain simply
// reads the source starting at s(outputSec), playing at rate 1.0. No
// grain is stretched, so no pitch bends. Only WHERE consecutive grains
// read from follows the warp: between one grain and the next the
// output advances by outputHop, so the read position advances by the
// local slope times that —
//
// RULE (grain advance): sourceHop = outputHop * rate
//
// which is s'(p) sampled instead of played. Steep segments (rate > 1)
// hop through the source faster than the output clock, skipping
// material; shallow segments (rate < 1) hop slower, re-reading
// material. The grains overlap and a window function (derived at the
// bottom of this file) crossfades every seam, so neither the skips nor
// the repeats are heard as edits.
// </doc>

// ---------------------------------------------------------------------
// s(p), implemented
// ---------------------------------------------------------------------
//
// One detail the formula above leaves open: p outside the anchored
// span. The repo-wide step-map convention applies — extrapolate the
// boundary segments. Before the first anchor, the first segment's
// rate runs backwards (the line through anchor 0 keeps its slope to
// the left); past the last anchor, the last segment's rate continues
// forward. Concretely: clamp the segment index to [0, rates.length-1]
// and evaluate the same line.
//
// At an anchor exactly, p - projectSecond_n is exactly 0, so
// s(projectSecond_n) === fileSecond_n with no float fuzz — beats land
// EXACTLY, which test 4 in the catalogue asserts with strict equality.

/**
 * The source-position function s(p): which file second should be
 * sounding at output (project) time p.
 *
 * @param {{anchors: Array, rates: Array}} plan from `stretchPlan`.
 * @param {number} p output time in seconds.
 * @returns {number} source position in file seconds.
 */
export function sourcePositionAt(plan, p) {
  if (typeof p !== "number" || !Number.isFinite(p)) {
    throw new Error(`sourcePositionAt: p must be a finite number, got ${p}`);
  }
  const { anchors, rates } = plan;

  // Find the segment whose half-open span [projectSecond_i,
  // projectSecond_i+1) contains p. The scan stops at the last segment
  // (index anchors.length - 2 === rates.length - 1), which is also
  // what extrapolates past the end; never advancing past index 0 for
  // small p is what extrapolates the start. Anchor arrays are short
  // (one per beat), so a linear scan is honest and obviously correct.
  let i = 0;
  while (i < rates.length - 1 && p >= anchors[i + 1].projectSecond) {
    i += 1;
  }

  const anchor = anchors[i];
  return anchor.fileSecond + rates[i].rate * (p - anchor.projectSecond);
}

// ---------------------------------------------------------------------
// The grain schedule — the chapter's new math
// ---------------------------------------------------------------------
//
// Grains are laid on the OUTPUT clock, not the source clock: the
// output is the rigid thing (the project grid), so that is where
// regularity belongs. Two knobs:
//
//   grainSec — each grain's duration (default 0.08 s).
//   overlap  — the fraction of a grain shared with its neighbour
//              (default 0.5, i.e. 50%).
//
// If each new grain starts when the previous one is (1 - overlap) of
// the way through, the start-to-start spacing is
//
//     outputHop = grainSec * (1 - overlap)
//
// — for the defaults, a grain starts every 0.08 * 0.5 = 0.04 s of
// project time. Grain k starts at
//
//     outputSec_k = fromSec + k * outputHop
//
// (computed by multiplication, not by accumulating += hop, so float
// error does not compound across hundreds of grains), and reads source
// starting at
//
//     sourceSec_k = s(outputSec_k)
//
// That single line is the whole trick. Subtract consecutive grains
// inside one segment and the anchors cancel:
//
//     sourceSec_k+1 - sourceSec_k = rate * outputHop
//
// — the grain-advance RULE from the doc block, in scheduler form.
// Worked numbers (the wobbly fixture, project 120 BPM, defaults): the
// grain at outputSec 0.5 reads sourceSec 0.25 (beat 1's anchor); the
// next grain at 0.54 reads 0.25 + 1.2 * 0.04 = 0.298.
//
// durationSec is always grainSec. A grain may straddle a segment
// boundary — its start position obeyed one rate, the next grain's
// start obeys the next rate, and the material in between is whatever
// the file contains. That is fine BECAUSE the per-grain pitch is 1.0
// regardless; nothing about a boundary bends anything.
//
// Coverage: grains are emitted while outputSec_k < toSec — the span
// [fromSec, toSec) is covered, the last grain starting within one hop
// of toSec, and no grain starts at or beyond it. The count is
// ceil((toSec - fromSec) / outputHop).

/**
 * Lay grains on the output clock and read each one's source position
 * off s(p).
 *
 * @param {{anchors: Array, rates: Array}} plan from `stretchPlan`.
 * @param {object} opts
 * @param {number} [opts.grainSec=0.08] grain duration in seconds, > 0.
 * @param {number} [opts.overlap=0.5] neighbour overlap fraction, in (0, 1).
 * @param {number} [opts.fromSec=0] start of the output span.
 * @param {number} opts.toSec end of the output span (required, > fromSec).
 * @returns {Array<{outputSec: number, sourceSec: number, durationSec: number}>}
 */
export function grainSchedule(plan, opts) {
  if (opts === null || typeof opts !== "object") {
    throw new Error("grainSchedule: opts object with toSec is required");
  }
  const { grainSec = 0.08, overlap = 0.5, fromSec = 0, toSec } = opts;

  if (typeof toSec !== "number" || !Number.isFinite(toSec)) {
    throw new Error("grainSchedule: opts.toSec is required and must be a finite number");
  }
  if (typeof grainSec !== "number" || !Number.isFinite(grainSec) || grainSec <= 0) {
    throw new Error(`grainSchedule: grainSec must be > 0, got ${grainSec}`);
  }
  if (typeof overlap !== "number" || !Number.isFinite(overlap) || overlap <= 0 || overlap >= 1) {
    throw new Error(`grainSchedule: overlap must be strictly between 0 and 1, got ${overlap}`);
  }
  if (typeof fromSec !== "number" || !Number.isFinite(fromSec)) {
    throw new Error(`grainSchedule: fromSec must be a finite number, got ${fromSec}`);
  }
  if (toSec <= fromSec) {
    throw new Error(`grainSchedule: toSec (${toSec}) must be greater than fromSec (${fromSec})`);
  }

  const outputHop = grainSec * (1 - overlap);

  const grains = [];
  for (let k = 0; ; k += 1) {
    const outputSec = fromSec + k * outputHop; // multiply, don't accumulate
    if (outputSec >= toSec) break;
    grains.push({
      outputSec,
      sourceSec: sourcePositionAt(plan, outputSec),
      durationSec: grainSec,
    });
  }
  return grains;
}

// ---------------------------------------------------------------------
// The window — the seam-hiding math
// ---------------------------------------------------------------------
//
// Butting raw grain edges together would click: a waveform chopped at
// an arbitrary sample jumps discontinuously. So each grain is shaped
// by a window that is 0 at both ends — it fades in and out — and the
// grains overlap so the fades crossfade.
//
// The window used here is the raised cosine, a.k.a. Hann, over
// normalized grain time tNorm in [0, 1]:
//
//     w(t) = 0.5 * (1 - cos(2 * pi * t))
//
// Zero at t = 0 and t = 1 (cos(0) = cos(2 pi) = 1), peak 1 at t = 0.5.
// The half-angle identity rewrites it as
//
//     w(t) = sin(pi * t)^2
//
// and THAT form explains why 50% overlap is special. At 50% overlap
// the neighbouring grain sits exactly half a window later, and
// sin shifted by half a period is cos:
//
//     w(t + 1/2) = sin(pi * t + pi/2)^2 = cos(pi * t)^2
//
// so wherever two grains overlap, their gains sum to
//
//     w(t) + w(t + 1/2) = sin(pi * t)^2 + cos(pi * t)^2 = 1
//
// — the Pythagorean identity, doing audio engineering. The summed
// envelope is constant: the output level neither pumps nor dips as
// grains come and go. This property is called CONSTANT-OVERLAP-ADD
// (COLA). It is special to this window-and-overlap pairing: at other
// overlap fractions the Hann sum is NOT constant (it ripples), which
// is why the demo, when it lets you drag the overlap knob, normalizes
// by the actual window sum instead of assuming 1.

/**
 * Hann window gain at normalized grain time.
 *
 * @param {number} tNorm position within the grain, 0 = start, 1 = end.
 * @returns {number} gain in [0, 1]; 0 outside [0, 1].
 */
export function grainGainAt(tNorm) {
  if (typeof tNorm !== "number" || !Number.isFinite(tNorm)) {
    throw new Error(`grainGainAt: tNorm must be a finite number, got ${tNorm}`);
  }
  if (tNorm < 0 || tNorm > 1) return 0;
  return 0.5 * (1 - Math.cos(2 * Math.PI * tNorm));
}
