// <doc id="meter-intro">
// ===========================================================================
// meter.js — the meter layer. No calculus. Integer division and modulo only.
//
// Tempo (chapters 01–02) answers "what SECOND is beat β?" via an integral.
// Meter answers "what BAR and position-in-bar is beat index n?" via division.
// They share a timeline but are computed completely independently.
//
// A meterMap is a list of changes, each saying "from this beat index onward,
// there are this many beats per bar":
//   [{ fromBeat: 0, beatsPerBar: 4 }, { fromBeat: 32, beatsPerBar: 3 }]
// fromBeat values must be downbeats (a meter change can only begin on a bar).
// ===========================================================================
// </doc>

// Which meter segment governs a given (zero-based) beat index.
function segmentFor(meterMap, beatIndex) {
  let seg = meterMap[0];
  for (const m of meterMap) {
    if (m.fromBeat <= beatIndex) seg = m; else break;
  }
  return seg;
}

// Map a beat index to { bar, positionInBar, isDownbeat }.
//
// `bar` is zero-based (bar 0 = first bar after the pickup). `positionInBar`
// is **1-indexed** to match beat_this's beatInBar convention -- the
// downbeat is 1, second beat is 2, etc. up to beatsPerBar. isDownbeat is
// true when positionInBar === 1.
//
// Within a single constant-meter run this is:
//   positionInBar = ((beatIndex - segmentStart) mod beatsPerBar) + 1
//   bar           = barsBefore + floor((beatIndex - segmentStart) / beatsPerBar)
// i.e. one modulo plus a +1 shift for the 1-based display, and one division.
// The loop below only exists to carry the running bar count across meter
// changes, since each change can start a run of a different length.
export function barPositionOf(meterMap, beatIndex) {
  if (beatIndex < 0) throw new Error("beatIndex must be >= 0");
  let barsBefore = 0;
  for (let i = 0; i < meterMap.length; i++) {
    const seg = meterMap[i];
    const next = meterMap[i + 1];
    const segStart = seg.fromBeat;
    const segEnd = next ? next.fromBeat : Infinity; // exclusive
    if (beatIndex < segEnd) {
      const offset = beatIndex - segStart;
      const positionInBar = (offset % seg.beatsPerBar) + 1;
      const bar = barsBefore + Math.floor(offset / seg.beatsPerBar);
      return { bar, positionInBar, isDownbeat: positionInBar === 1 };
    }
    // whole segment consumed: add the bars it contained before moving on
    const span = segEnd - segStart;
    barsBefore += Math.ceil(span / seg.beatsPerBar);
  }
  throw new Error("unreachable");
}

// Pick which click a beat should play. The whole meter layer in one call.
export function clickForBeat(meterMap, beatIndex) {
  return barPositionOf(meterMap, beatIndex).isDownbeat ? "accent" : "normal";
}

// Recover a meterMap from beat_this output: derive the meter from where the
// downbeats fall, rather than from any declared time signature.
//   beats:     array of all beat timestamps (seconds), ascending
//   downbeats: array of downbeat timestamps (a subset of beats)
// A meter change is recorded whenever the gap (in beats) between consecutive
// downbeats differs from the previous gap.
export function meterMapFromBeats(beats, downbeats) {
  const isDown = new Set(downbeats.map((t) => +t.toFixed(6)));
  const downIndices = [];
  beats.forEach((t, i) => { if (isDown.has(+t.toFixed(6))) downIndices.push(i); });
  if (downIndices.length < 2) return [{ fromBeat: 0, beatsPerBar: 4 }]; // fallback
  const map = [];
  let prevGap = null;
  for (let k = 0; k < downIndices.length - 1; k++) {
    const gap = downIndices[k + 1] - downIndices[k];
    if (gap !== prevGap) {
      map.push({ fromBeat: downIndices[k], beatsPerBar: gap });
      prevGap = gap;
    }
  }
  if (map.length === 0 || map[0].fromBeat !== 0) {
    map.unshift({ fromBeat: 0, beatsPerBar: map[0]?.beatsPerBar ?? 4 });
  }
  return map;
}
