// =====================================================================
// 08 · The grid follows the file
// =====================================================================
//
// Chapter 07 warped the FILE onto a rigid grid. That direction must
// touch the signal: varispeed shifts pitch, time-stretch needs DSP.
// This chapter goes the other way and touches NOTHING:
//
//     conform the PROJECT's tempo map to the file's beat map.
//
// The audio plays raw, rate 1.0, bit-identical. What moves is the
// grid: the metronome, the bar ruler, every MIDI clip -- they all
// follow the file's wobble, because the project's tempo map IS the
// file's beat map. This is the other half of the DAW workflow pair
// (Ableton's "Set tempo from clip", Logic's "adapt project tempo").
//
// This is also the repo's first ADVANCED chapter: instead of plain
// Web Audio it drives @dawcore/transport, a production transport
// whose TempoMap implements the very regimes chapter 01 derived --
// 'step' is the piecewise-constant rectangle sum, 'linear' is the
// (60/s)·ln(...) closed form, 'curve' falls back to the trapezoidal
// rule. The tests in this chapter PROVE the equivalence numerically:
// chapter-01 math and the production TempoMap agree on every beat.
//
// <doc id="grid-follows-file">
// A transport schedules in ticks (chapter 07) against a tempo map
// (chapter 01). To make the grid follow the file, feed it one tempo
// event per file beat, holding each segment's BPM as a step:
//
//     event n:  tick = (n - 1) * PPQN,   bpm = segmentBpm(m[n], m[n+1])
//
// The tick is chapter 07's anchor verbatim -- tick 0 is beat 1 -- and
// the bpm is chapter 05's instantaneous BPM, the per-gap rate the
// detectors already compute. Nothing new is derived; two existing
// layers are plugged into each other.
//
// One number-system wrinkle remains, and it is the lead-in again.
// The transport anchors tick 0 at transport second 0, but the file's
// beat 1 sits at t_first > 0 in the audio -- and the file may open
// with PICKUP beats, the tail of a bar that began before the
// recording. The grid itself is non-negotiable: a DAW's grid is
// always FULL BARS from tick 0. So the placement must satisfy two
// constraints at once:
//
//   1. the first DOWNBEAT lands exactly on a bar boundary
//      (tick = k * beatsPerBar * PPQN), and
//   2. the pickup beats fill the END of the bar before it.
//
// With p pickup beats, the first bar boundary with room for them is
//
//     firstDownbeatTick = ceil(p * PPQN / ticksPerBar) * ticksPerBar
//     firstBeatTick     = firstDownbeatTick - p * PPQN
//
// and the file's beat n then lives at firstBeatTick + (n-1) * PPQN --
// chapter 07's anchor, shifted whole. The grid before the first beat
// (the empty lead-in bars the metronome counts through) runs at the
// first segment's tempo, and the CLIP is placed so the audio's beat-1
// sample sounds exactly at firstBeatTick's second: any audio before
// t_first now PLAYS during the lead-in instead of being trimmed.
// With no pickup, firstBeatTick = 0 and this degenerates to the plain
// clip offset: trim t_first, beat 1 at tick 0.
//
// RULE (grid conformity): tempoMap.ticksToSeconds(firstBeatTick + (n-1) * PPQN) = clipStartSec + m[n].second
//
// That rule is the whole chapter: the production transport's clock,
// evaluated at beat n's tick, must reproduce the beat tracker's
// timestamp shifted by where the clip sits -- through chapter-01 math
// on one side and @dawcore/transport's TempoMap on the other. The
// tests assert both, with and without pickups.
// </doc>
import { segmentBpm } from "@warp-math/the-math/tempo-map.js";

// ---------------------------------------------------------------------
// tempoEventsFromMarkers(markers, ppqn) -> { events, clipOffsetSec }
//
//   events        [{ tick, bpm }, ...]  one per segment, step-held,
//                 ready for transport.setTempo(bpm, tick)
//   clipOffsetSec markers[0].second -- trim this much off the clip's
//                 start so file beat 1 plays at transport second 0
//                 (resolution 1 above)
// ---------------------------------------------------------------------
export function tempoEventsFromMarkers(markers, ppqn) {
  if (!Number.isInteger(ppqn) || ppqn <= 0) {
    throw new Error(`ppqn must be a positive integer, got ${ppqn}`);
  }
  if (!Array.isArray(markers) || markers.length < 2) {
    throw new Error(
      "tempoEventsFromMarkers requires at least 2 markers (a tempo needs a gap)"
    );
  }
  for (let i = 1; i < markers.length; i++) {
    if (
      markers[i].beat <= markers[i - 1].beat ||
      markers[i].second <= markers[i - 1].second
    ) {
      throw new Error(
        `markers must be strictly increasing on both axes (index ${i})`
      );
    }
  }

  const events = [];
  for (let i = 0; i < markers.length - 1; i++) {
    events.push({
      // Beat numbers are 1-indexed; ticks anchor tick 0 at beat 1
      // (chapter 07). markers[i] is beat number markers[i].beat, so its
      // tick is (beat - 1) * ppqn -- NOT i * ppqn, in case the beat map
      // skips numbers.
      tick: (markers[i].beat - 1) * ppqn,
      bpm: segmentBpm(markers[i], markers[i + 1]),
    });
  }

  return { events, clipOffsetSec: markers[0].second };
}

// ---------------------------------------------------------------------
// gridPlanFromBeats(parsedBeats, ppqn, beatsPerBar) -> the full plan
//
// The production-shaped version: takes the PARSED .beats rows (which
// carry beatInBar, so pickups are detectable), bar-aligns the first
// downbeat, and returns everything a transport needs:
//
//   markers           [{ beat, second }] -- 1-indexed, as everywhere
//   events            [{ tick, bpm }]    -- setTempo() calls, including
//                     the lead-in event at tick 0 when the grid starts
//                     before the first beat
//   pickupBeats       rows before the first beatInBar === 1
//   firstBeatTick     tick of file beat 1 (0 when no pickup)
//   firstDownbeatTick bar-aligned tick of the first downbeat --
//                     always a multiple of beatsPerBar * ppqn
//   clipStartSec      transport second where the clip's sample 0 goes.
//                     >= 0: schedule it there (lead-in audio plays).
//                     < 0: trim that much off the clip's start.
// ---------------------------------------------------------------------
export function gridPlanFromBeats(parsedBeats, ppqn, beatsPerBar = 4) {
  if (!Number.isInteger(beatsPerBar) || beatsPerBar <= 0) {
    throw new Error(`beatsPerBar must be a positive integer, got ${beatsPerBar}`);
  }
  if (!Array.isArray(parsedBeats) || parsedBeats.length < 2) {
    throw new Error("gridPlanFromBeats requires at least 2 parsed beats");
  }
  const markers = parsedBeats.map((b, i) => ({ beat: i + 1, second: b.second }));
  // Validates monotonicity and computes the tick-0-anchored events.
  const base = tempoEventsFromMarkers(markers, ppqn);

  const firstDownbeatIdx = parsedBeats.findIndex((b) => b.beatInBar === 1);
  const pickupBeats = firstDownbeatIdx < 0 ? 0 : firstDownbeatIdx;
  const ticksPerBar = beatsPerBar * ppqn;
  // Full bars, always: the first downbeat goes on the first bar
  // boundary with room for the pickup before it.
  const firstDownbeatTick =
    pickupBeats === 0
      ? 0
      : ticksPerBar * Math.ceil((pickupBeats * ppqn) / ticksPerBar);
  const firstBeatTick = firstDownbeatTick - pickupBeats * ppqn;

  const bpm1 = base.events[0].bpm;
  const events = [];
  // The empty lead-in bars (tick 0 .. firstBeatTick) tick at the first
  // segment's tempo so the count-in feel matches the music's entry.
  if (firstBeatTick > 0) events.push({ tick: 0, bpm: bpm1 });
  for (const e of base.events) {
    events.push({ tick: e.tick + firstBeatTick, bpm: e.bpm });
  }

  // Only bpm1 is in force before firstBeatTick, so its second is closed
  // form; the clip is placed so the audio's t_first sample lands there.
  const firstBeatSec = (firstBeatTick * 60) / (bpm1 * ppqn);
  const clipStartSec = firstBeatSec - markers[0].second;

  return {
    markers,
    events,
    pickupBeats,
    beatsPerBar,
    ticksPerBar,
    firstBeatTick,
    firstDownbeatTick,
    firstBeatSec,
    clipStartSec,
  };
}

// ---------------------------------------------------------------------
// Reference implementation of the conformed grid's clock, in pure
// chapter-01 terms -- used by the tests to cross-check the production
// TempoMap, and by the demo to draw the grid without asking the
// transport. The grid's second for beat n (1-indexed) is the file's
// second minus the clip offset:
//
//     gridSecondForBeat(n) = m[n].second - m[1].second
//
// because conforming makes the project clock and the (offset) file
// clock the same clock. Between beats it interpolates at the segment
// BPM, exactly like the step tempo map does.
// ---------------------------------------------------------------------
export function gridSecondForBeat(markers, beatNumber) {
  const first = markers[0];
  const last = markers[markers.length - 1];
  if (beatNumber <= first.beat) {
    // Before the first marker the step map extrapolates the first
    // segment's tempo backwards.
    const bpm = segmentBpm(markers[0], markers[1]);
    return (beatNumber - first.beat) * (60 / bpm);
  }
  if (beatNumber >= last.beat) {
    const bpm = segmentBpm(markers[markers.length - 2], last);
    return (
      last.second - first.second + (beatNumber - last.beat) * (60 / bpm)
    );
  }
  // Interior: find the segment, interpolate at its constant tempo.
  for (let i = 0; i < markers.length - 1; i++) {
    const a = markers[i];
    const b = markers[i + 1];
    if (beatNumber <= b.beat) {
      const bpm = segmentBpm(a, b);
      return a.second - first.second + (beatNumber - a.beat) * (60 / bpm);
    }
  }
  /* istanbul ignore next -- unreachable, loop covers the interior */
  throw new Error("unreachable");
}
