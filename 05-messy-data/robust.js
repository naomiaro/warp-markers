// <doc id="messy-intro">
// ===========================================================================
// robust.js -- when the data is messy
//
// Every example up to here has handed the math layer a tidy marker list.
// Real beat_this output is not tidy: timestamps jitter by a few milliseconds,
// the tracker occasionally drops a beat (gap to next beat ~2x normal) or
// doubles one (gap ~0.5x normal), and very rarely a downstream edit makes
// the seconds column non-monotonic, which is the one thing the warp map
// genuinely cannot survive.
//
// This file *detects* those problems -- it does not fix them. Fixing is a
// judgement call (snap to nearest grid? interpolate? hand back to the user?)
// that belongs to the application, not to the math. The whole point of warp
// markers being hand-editable is that the human is the final arbiter.
//
// All functions operate on the same `markers` shape as 01-the-math:
//   [{ beat: 0, second: 0 }, { beat: 1, second: 0.5 }, ...]
// ===========================================================================
// </doc>
import { segmentBpm } from "@warp-math/the-math/tempo-map.js";


// ---------------------------------------------------------------------------
// instantaneousBpms(markers)
//
// The raw signal you inspect for problems: between each adjacent pair of
// markers, what BPM do they imply? Returns an array of length markers.length
// - 1, parallel to the segments. This is the same calculation segmentBpm
// already does -- we just walk the list and apply it.
// ---------------------------------------------------------------------------
export function instantaneousBpms(markers) {
  const out = new Array(markers.length - 1);
  for (let i = 0; i < markers.length - 1; i++) {
    // segmentBpm throws on a non-monotonic pair. We catch that here and
    // return NaN so the caller's array indices stay aligned with `markers`.
    // monotonicityHoles() is the right tool for reporting that failure;
    // poisoning instantaneousBpms with NaN would mask it.
    try {
      out[i] = segmentBpm(markers[i], markers[i + 1]);
    } catch {
      out[i] = NaN;
    }
  }
  return out;
}


// ---------------------------------------------------------------------------
// flagAnomalies(markers, opts) -> Array<{ index, kind, detail }>
//
// "index" is the SEGMENT index (between markers[index] and markers[index+1]),
// the same index space as instantaneousBpms.
//
// Three kinds of problem are flagged. They are heuristics, not facts -- a
// real piece can have a 240 BPM passage or a sudden tempo change. The
// thresholds are exposed so the caller can tune them per genre or per
// detector. Defaults err on the side of flagging too much (a noisy alarm is
// easier to dismiss than a missed bug).
//
//   "too-slow" : segment BPM below `lowBpm`. The classic dropped-beat
//                signature: the tracker missed a beat, so the gap to the
//                next is roughly doubled, and the implied BPM is halved.
//   "too-fast" : segment BPM above `highBpm`. The doubled-beat signature:
//                a spurious mid-segment beat is inserted, halving the gap.
//   "jump"     : adjacent segments differ by more than `jumpRatio` (or its
//                inverse) -- a tempo discontinuity larger than physical
//                rubato could explain. This catches anomalies that hide
//                inside the [lowBpm, highBpm] band: e.g. a 120 -> 200 -> 120
//                blip that never leaves the legal range but is clearly noise.
// ---------------------------------------------------------------------------
export function flagAnomalies(
  markers,
  { lowBpm = 30, highBpm = 300, jumpRatio = 1.5 } = {}
) {
  const bpms = instantaneousBpms(markers);
  const out = [];

  for (let i = 0; i < bpms.length; i++) {
    const b = bpms[i];
    if (!Number.isFinite(b)) continue; // monotonicityHoles handles that case
    if (b < lowBpm) {
      out.push({
        index: i,
        kind: "too-slow",
        detail: `segment BPM ${b.toFixed(1)} < ${lowBpm} (dropped beat?)`,
      });
    } else if (b > highBpm) {
      out.push({
        index: i,
        kind: "too-fast",
        detail: `segment BPM ${b.toFixed(1)} > ${highBpm} (doubled beat?)`,
      });
    }
  }

  // Jumps are reported on the BOUNDARY between two segments, indexed by the
  // later segment (i.e. "the segment whose BPM differs sharply from its
  // predecessor"). We compare ratios both ways so a halving and a doubling
  // are both caught.
  for (let i = 1; i < bpms.length; i++) {
    const a = bpms[i - 1];
    const b = bpms[i];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const ratio = b / a;
    if (ratio > jumpRatio || ratio < 1 / jumpRatio) {
      out.push({
        index: i,
        kind: "jump",
        detail: `BPM ${a.toFixed(1)} -> ${b.toFixed(1)} (ratio ${ratio.toFixed(2)})`,
      });
    }
  }

  return out.sort((p, q) => p.index - q.index || p.kind.localeCompare(q.kind));
}


// ---------------------------------------------------------------------------
// monotonicityHoles(markers) -> Array<number>
//
// Indices where `second` does not strictly increase. These are the fatal
// failures: chapter 01's warp map is defined as a function from beats to
// seconds, and it has an inverse only because the seconds column is
// strictly monotonic. If two consecutive markers share a second, or worse,
// go backwards, secondsToBeats has no single answer at that t -- the map
// stops being a function.
//
// Returned indices point at the marker that violated the rule (i.e. the
// later of the offending pair). The caller can render them as "this marker
// breaks invertibility" without having to re-do the diff.
// ---------------------------------------------------------------------------
export function monotonicityHoles(markers) {
  const out = [];
  for (let i = 1; i < markers.length; i++) {
    if (markers[i].second <= markers[i - 1].second) out.push(i);
    if (markers[i].beat <= markers[i - 1].beat) out.push(i);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}
