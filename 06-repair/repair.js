// <doc id="repair-intro">
// ===========================================================================
// repair.js -- hand-edit operations for a beat map
//
// Chapter 05 *detects* problems in beat-tracker output and deliberately
// stops there: the math layer reports anomalies, but fixing them is a
// judgement call that belongs above it. Chapter 06 is the other half of
// that pair -- the user repairs a mostly-correct map by hand, with the
// math layer doing only what it must to keep edits valid.
//
// This is also where the two layers built separately finally operate
// together. Chapter 02's `pin()` lives in tempo space ({beat, second}
// pairs and the warp map); chapter 04's `barPositionOf` lives in meter
// space (bar index, position-in-bar, count of beats per bar). An
// accidental extra beat in a 4/4 bar is INVISIBLE in pure tempo terms --
// nothing about the tempo curve says "this bar has 5 beats." Only the
// meter overlay flags it. So every repair op here speaks to BOTH layers:
// the operation rebuilds the tempo markers AND re-derives which absolute
// beat indices are downbeats, because deleting or inserting shifts those
// indices.
//
// Three repair operations match the three error types beat_this makes:
//   - extra/doubled beat -> deleteBeat
//   - dropped/missing beat -> insertBeat
//   - mistimed beat        -> moveBeat (a thin wrapper over ch.02's pin)
// ===========================================================================
// </doc>
import { pin } from "@warp-math/the-math/warp-marker.js";
import { barPositionOf, meterMapFromBeats } from "@warp-math/meter/meter.js";


// ---------------------------------------------------------------------------
// deleteBeat(markers, downbeatIndices, index)
//   -> { markers, downbeatIndices }
//
// Remove the beat at `index`. The two segments adjacent to the deleted
// beat merge into one wider segment; the derived tempo on that new
// segment is whatever `segmentBpm` computes from the wider gap (chapter
// 01 -- nothing extra to do, the next read of the tempo map handles it).
//
// Downbeats need a re-indexing pass: every downbeat after `index` shifts
// down by one absolute index. If the deleted beat WAS a downbeat, drop
// it from the set (which beat becomes the bar's new downbeat is a
// judgement call the user has to make next; we don't pick automatically).
// ---------------------------------------------------------------------------
export function deleteBeat(markers, downbeatIndices, index) {
  if (index < 0 || index >= markers.length) {
    throw new Error(`deleteBeat: index ${index} out of range`);
  }
  const nextMarkers = markers.filter((_, i) => i !== index);
  const nextDowns = (downbeatIndices || [])
    .filter((d) => d !== index)
    .map((d) => (d > index ? d - 1 : d));
  return { markers: nextMarkers, downbeatIndices: nextDowns };
}


// ---------------------------------------------------------------------------
// insertBeat(markers, downbeatIndices, second, { asDownbeat = false } = {})
//   -> { markers, downbeatIndices, insertedAt }
//
// Add a beat at audio time `second`. The new beat slots into the
// existing time order; downstream indices shift up by one. Throws if
// the new time duplicates an existing marker's time (within a tiny
// epsilon) or breaks monotonicity in some other way -- a beat map's
// time axis must remain strictly increasing for the warp map to be
// invertible.
//
// `asDownbeat` is a hint: pass true if the inserted beat is itself a
// downbeat (e.g. the user is restoring a missing bar 1).
// ---------------------------------------------------------------------------
const TIME_EPS = 1e-6;
export function insertBeat(markers, downbeatIndices, second, opts = {}) {
  if (!Number.isFinite(second)) {
    throw new Error("insertBeat: second must be a finite number");
  }
  for (const m of markers) {
    if (Math.abs(m.second - second) < TIME_EPS) {
      throw new Error(
        `insertBeat: a beat already exists at t=${second.toFixed(6)}`
      );
    }
  }
  // Find insertion point: first index whose time exceeds `second`.
  let insertedAt = markers.length;
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].second > second) {
      insertedAt = i;
      break;
    }
  }
  const nextMarkers = [
    ...markers.slice(0, insertedAt),
    { second },
    ...markers.slice(insertedAt),
  ];

  // Verify strict monotonicity after insert -- guards against, e.g., NaN
  // upstream that slipped past the !isFinite check.
  for (let i = 1; i < nextMarkers.length; i++) {
    if (nextMarkers[i].second <= nextMarkers[i - 1].second) {
      throw new Error(
        `insertBeat would break monotonicity at index ${i}`
      );
    }
  }

  // Shift downbeat indices up by one for every existing downbeat at or
  // beyond the insertion point. If asDownbeat is set, register the new
  // beat as a downbeat too.
  let nextDowns = (downbeatIndices || []).map((d) =>
    d >= insertedAt ? d + 1 : d
  );
  if (opts.asDownbeat) {
    nextDowns = [...nextDowns, insertedAt].sort((a, b) => a - b);
  }
  return { markers: nextMarkers, downbeatIndices: nextDowns, insertedAt };
}


// ---------------------------------------------------------------------------
// moveBeat(markers, index, newSecond)
//   -> markers
//
// Thin wrapper over chapter 02's pin(). Re-pins a single beat to a new
// audio time. The {beat, second} model that pin() expects is built from
// markers' time order: the i-th marker has musical beat i, audio time
// markers[i].second.
//
// pin() does the monotonicity check; we just translate the return value
// back into the time-only marker shape this chapter uses.
// ---------------------------------------------------------------------------
export function moveBeat(markers, index, newSecond) {
  if (index < 0 || index >= markers.length) {
    throw new Error(`moveBeat: index ${index} out of range`);
  }
  const model = markers.map((m, i) => ({ beat: i, second: m.second }));
  const moved = pin(model, index, newSecond);
  return moved.map(({ second }) => ({ second }));
}


// ---------------------------------------------------------------------------
// relabelDownbeat(markers, downbeatIndices, index, isDownbeat)
//   -> { markers, downbeatIndices }
//
// The FOURTH error type, discovered on real tracker output after the
// first three were built: a beat whose TIME is perfect but whose LABEL
// is wrong. scar_tissue.beats ends with its final beat marked
// beatInBar=1, conjuring a phantom 1-beat bar -- no beat needs deleting,
// inserting, or moving; the downbeat flag itself is the defect. This is
// a pure meter-layer edit: the tempo markers pass through untouched
// (same object, by design -- nothing in tempo space changed), and only
// the downbeat set is rebuilt.
//
// Like deleteBeat's policy, no automatic judgement: relabeling one beat
// can leave neighbouring bars odd-sized, and validateAgainstMeter will
// say so -- deciding what to do next belongs to the user.
// ---------------------------------------------------------------------------
export function relabelDownbeat(markers, downbeatIndices, index, isDownbeat) {
  if (index < 0 || index >= markers.length) {
    throw new Error(`relabelDownbeat: index ${index} out of range`);
  }
  const downs = downbeatIndices || [];
  const has = downs.includes(index);
  if (isDownbeat === has) return { markers, downbeatIndices: downs };
  const nextDowns = isDownbeat
    ? [...downs, index].sort((a, b) => a - b)
    : downs.filter((d) => d !== index);
  return { markers, downbeatIndices: nextDowns };
}


// ---------------------------------------------------------------------------
// validateAgainstMeter(markers, downbeatIndices, expectedBeatsPerBar = 4)
//   -> Array<{ bar, beatCount, ok, fromIndex, toIndex }>
//
// Walks the beats and groups them by bar (from one downbeat up to but
// not including the next), reporting how many beats each bar actually
// has and whether it matches `expectedBeatsPerBar`. The UI uses this to
// shade bars green/red without itself knowing how meter works.
//
// Bars before the first downbeat (a pickup) are reported as bar 0; the
// pickup count is *not* checked against expectedBeatsPerBar because by
// definition a pickup is shorter than a bar -- it's the partial bar
// before the recording's first downbeat.
//
// Bars after the last downbeat (an incomplete trailing bar) are reported
// too, but `ok` is true iff the trailing partial has at most
// expectedBeatsPerBar beats (a real "missing the end of a bar" case
// would otherwise always flag).
// ---------------------------------------------------------------------------
export function validateAgainstMeter(
  markers,
  downbeatIndices,
  expectedBeatsPerBar = 4
) {
  const downs = [...(downbeatIndices || [])].sort((a, b) => a - b);
  const out = [];

  // Pickup (anything before the first downbeat).
  if (downs.length === 0) {
    out.push({
      bar: 0,
      beatCount: markers.length,
      ok: false,
      fromIndex: 0,
      toIndex: markers.length - 1,
      isPickup: true,
    });
    return out;
  }
  if (downs[0] > 0) {
    out.push({
      bar: 0,
      beatCount: downs[0],
      ok: true, // pickup is allowed to be < beatsPerBar
      fromIndex: 0,
      toIndex: downs[0] - 1,
      isPickup: true,
    });
  }

  // Complete bars between successive downbeats.
  for (let k = 0; k < downs.length - 1; k++) {
    const from = downs[k];
    const to = downs[k + 1] - 1;
    const beatCount = to - from + 1;
    out.push({
      bar: k + 1,
      beatCount,
      ok: beatCount === expectedBeatsPerBar,
      fromIndex: from,
      toIndex: to,
      isPickup: false,
    });
  }

  // Trailing partial bar after the last downbeat.
  const lastDown = downs[downs.length - 1];
  if (lastDown < markers.length - 1) {
    const beatCount = markers.length - lastDown;
    out.push({
      bar: downs.length,
      beatCount,
      ok: beatCount <= expectedBeatsPerBar,
      fromIndex: lastDown,
      toIndex: markers.length - 1,
      isTrailing: true,
    });
  }

  return out;
}


// ---------------------------------------------------------------------------
// recoverDownbeats(parsedBeats) -> number[]
//
// Given the output of @warp-math/beats-io's parseBeats() -- an array of
// { second, beatInBar } where beatInBar === 1 marks a downbeat -- return
// the indices of the downbeats. Used by the demo to bootstrap the
// editor's state from an uploaded file.
// ---------------------------------------------------------------------------
export function recoverDownbeats(parsedBeats) {
  const out = [];
  for (let i = 0; i < parsedBeats.length; i++) {
    if (parsedBeats[i].beatInBar === 1) out.push(i);
  }
  return out;
}


// Re-export from the meter layer for callers that want a convenient
// single import.
export { barPositionOf, meterMapFromBeats };
