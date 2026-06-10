import { describe, it, expect } from "vitest";
import { TempoMap } from "@dawcore/transport";
import { piecewiseConstantMap } from "@warp-math/the-math/tempo-map.js";
import {
  tempoEventsFromMarkers,
  gridPlanFromBeats,
  gridSecondForBeat,
} from "./conform.js";

const PPQN = 960;

// The wobbly fixture from chapter 07's demo: 16 beats whose spacing
// wanders 0.6 / 0.5 / 0.4 / 0.5 s (100 / 120 / 150 / 120 BPM), first
// beat at 0.25 s.
function wobbly() {
  const gaps = [
    ...Array(4).fill(0.6),
    ...Array(4).fill(0.5),
    ...Array(4).fill(0.4),
    ...Array(3).fill(0.5),
  ];
  const m = [{ beat: 1, second: 0.25 }];
  for (let i = 0; i < gaps.length; i++) {
    m.push({ beat: i + 2, second: m[i].second + gaps[i] });
  }
  return m;
}

describe("tempoEventsFromMarkers", () => {
  it("emits one step event per segment at the chapter-07 tick of its start beat", () => {
    // Beat n anchors at tick (n-1)*PPQN (tick 0 = beat 1). Each event
    // holds the segment's instantaneous BPM until the next event.
    const { events, clipOffsetSec } = tempoEventsFromMarkers(wobbly(), PPQN);
    expect(events).toHaveLength(15);
    expect(clipOffsetSec).toBeCloseTo(0.25, 12);
    expect(events[0]).toEqual({ tick: 0, bpm: expect.closeTo(100, 9) });
    expect(events[4]).toEqual({ tick: 4 * PPQN, bpm: expect.closeTo(120, 9) });
    expect(events[8]).toEqual({ tick: 8 * PPQN, bpm: expect.closeTo(150, 9) });
    expect(events[12]).toEqual({ tick: 12 * PPQN, bpm: expect.closeTo(120, 9) });
  });

  it("uses the .beat field for ticks, not the array index", () => {
    // A beat map with a hole (beat 3 missing): the event for the
    // 2-beat-wide segment sits at beat 2's tick and its BPM averages
    // across the hole -- segmentBpm handles dBeat = 2.
    const m = [
      { beat: 1, second: 0.0 },
      { beat: 2, second: 0.5 },
      { beat: 4, second: 1.5 }, // beats 2 -> 4: 2 beats in 1.0 s = 120 BPM
    ];
    const { events } = tempoEventsFromMarkers(m, PPQN);
    expect(events[1].tick).toBe(1 * PPQN); // beat 2's tick, array index 1
    expect(events[1].bpm).toBeCloseTo(120, 9);
  });

  it("rejects fewer than 2 markers and non-monotonic input", () => {
    expect(() => tempoEventsFromMarkers([{ beat: 1, second: 0 }], PPQN)).toThrow(
      /at least 2/
    );
    expect(() =>
      tempoEventsFromMarkers(
        [
          { beat: 1, second: 0 },
          { beat: 2, second: 0 },
        ],
        PPQN
      )
    ).toThrow(/strictly increasing/);
  });
});

// =====================================================================
// THE CHAPTER'S CLAIM, proven three ways.
//
// RULE (grid conformity): for every marker n,
//     tempoMap.ticksToSeconds((beat_n - 1) * PPQN) + t_first = m[n].second
//
// Side 1: @dawcore/transport's production TempoMap, fed our events.
// Side 2: chapter-01's piecewiseConstantMap (the file's own map).
// Side 3: gridSecondForBeat, this chapter's pure reference clock.
// All three must agree to numerical noise at every beat AND between
// beats (the step interpolation).
// =====================================================================
describe("equivalence: chapter-01 math == @dawcore/transport TempoMap", () => {
  it("the production TempoMap reproduces every beat-tracker timestamp", () => {
    const markers = wobbly();
    const { events, clipOffsetSec } = tempoEventsFromMarkers(markers, PPQN);

    const tempoMap = new TempoMap(PPQN, events[0].bpm);
    for (const e of events) tempoMap.setTempo(e.bpm, e.tick);

    for (const m of markers) {
      const transportSec = tempoMap.ticksToSeconds((m.beat - 1) * PPQN);
      expect(transportSec + clipOffsetSec).toBeCloseTo(m.second, 9);
    }
  });

  it("agrees with chapter-01's piecewiseConstantMap between beats too", () => {
    const markers = wobbly();
    const { events, clipOffsetSec } = tempoEventsFromMarkers(markers, PPQN);
    const tempoMap = new TempoMap(PPQN, events[0].bpm);
    for (const e of events) tempoMap.setTempo(e.bpm, e.tick);
    const fileMap = piecewiseConstantMap(markers);

    // Quarter-beat sweep across the whole map, through both clocks.
    // beta is chapter-01's coordinate (beat n at beta = n); the
    // transport tick for beta is (beta - 1) * PPQN -- chapter 07.
    for (let beta = 1; beta <= 16; beta += 0.25) {
      const viaChapter01 = fileMap.beatsToSeconds(beta);
      const viaDawcore =
        tempoMap.ticksToSeconds((beta - 1) * PPQN) + clipOffsetSec;
      expect(viaDawcore).toBeCloseTo(viaChapter01, 9);
    }
  });

  it("gridSecondForBeat matches both, including extrapolation", () => {
    const markers = wobbly();
    const { events } = tempoEventsFromMarkers(markers, PPQN);
    const tempoMap = new TempoMap(PPQN, events[0].bpm);
    for (const e of events) tempoMap.setTempo(e.bpm, e.tick);

    for (let beat = 1; beat <= 18; beat += 0.5) {
      // 17, 17.5, 18 run past the last marker: the step map holds the
      // last segment's tempo, and so must the reference clock.
      const viaDawcore = tempoMap.ticksToSeconds((beat - 1) * PPQN);
      expect(gridSecondForBeat(markers, beat)).toBeCloseTo(viaDawcore, 9);
    }
  });

  it("full-bars plan: a 2-beat pickup fills the tail of bar 1, downbeat on the bar line", () => {
    // Chapter 03's pickup shape: the file opens mid-bar (beatInBar 3, 4)
    // and the first downbeat is the third row. Steady 120 BPM, first
    // beat at 0.25 s. The grid is always FULL BARS: the first downbeat
    // must land on a bar boundary, pickups right before it.
    const parsed = [];
    const beatInBars = [3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4];
    for (let i = 0; i < beatInBars.length; i++) {
      parsed.push({ second: 0.25 + i * 0.5, beatInBar: beatInBars[i] });
    }
    const plan = gridPlanFromBeats(parsed, PPQN, 4);

    expect(plan.pickupBeats).toBe(2);
    // First bar boundary with room for 2 pickup beats: tick 3840 (bar 2).
    expect(plan.firstDownbeatTick).toBe(4 * PPQN);
    expect(plan.firstDownbeatTick % plan.ticksPerBar).toBe(0); // full bars
    expect(plan.firstBeatTick).toBe(2 * PPQN);
    // Lead-in event at tick 0 holds the first segment's tempo (120), so
    // beat 1 sounds at tick 1920 = 1.0 s; the clip (audio sample 0) goes
    // at 1.0 - 0.25 = 0.75 s -- the file's own lead-in PLAYS, untrimmed.
    expect(plan.events[0]).toEqual({ tick: 0, bpm: expect.closeTo(120, 9) });
    expect(plan.clipStartSec).toBeCloseTo(0.75, 12);

    // RULE (grid conformity), pickup edition, through the production map:
    const tempoMap = new TempoMap(PPQN, plan.events[0].bpm);
    for (const e of plan.events) tempoMap.setTempo(e.bpm, e.tick);
    for (const m of plan.markers) {
      const tick = plan.firstBeatTick + (m.beat - 1) * PPQN;
      expect(tempoMap.ticksToSeconds(tick)).toBeCloseTo(
        plan.clipStartSec + m.second,
        9
      );
    }
  });

  it("full-bars plan: no pickup degenerates to the plain clip offset", () => {
    // beatInBar 1 on the first row: firstBeatTick = 0, clipStartSec is
    // negative (trim the lead-in), events identical to
    // tempoEventsFromMarkers' anchoring.
    const markers = wobbly();
    const parsed = markers.map((m, i) => ({
      second: m.second,
      beatInBar: (i % 4) + 1,
    }));
    const plan = gridPlanFromBeats(parsed, PPQN, 4);
    expect(plan.pickupBeats).toBe(0);
    expect(plan.firstBeatTick).toBe(0);
    expect(plan.firstDownbeatTick).toBe(0);
    expect(plan.clipStartSec).toBeCloseTo(-0.25, 12);
    expect(plan.events).toEqual(tempoEventsFromMarkers(markers, PPQN).events);
  });

  it("full-bars plan: a file with no downbeat at all treats pickup as zero", () => {
    const parsed = [
      { second: 0.5, beatInBar: 2 },
      { second: 1.0, beatInBar: 3 },
      { second: 1.5, beatInBar: 4 },
    ];
    const plan = gridPlanFromBeats(parsed, PPQN, 4);
    expect(plan.pickupBeats).toBe(0);
    expect(plan.firstBeatTick).toBe(0);
  });

  it("round trips: secondsToTicks inverts ticksToSeconds across tempo changes", () => {
    const markers = wobbly();
    const { events } = tempoEventsFromMarkers(markers, PPQN);
    const tempoMap = new TempoMap(PPQN, events[0].bpm);
    for (const e of events) tempoMap.setTempo(e.bpm, e.tick);

    for (let beat = 1; beat <= 16; beat += 0.5) {
      const tick = (beat - 1) * PPQN;
      const sec = tempoMap.ticksToSeconds(tick);
      expect(Number(tempoMap.secondsToTicks(sec))).toBeCloseTo(tick, 3);
    }
  });
});
