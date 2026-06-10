import { describe, it, expect } from "vitest";
import {
  constantMap,
  piecewiseConstantMap,
} from "@warp-math/the-math/tempo-map.js";
import {
  betaForTick,
  tickForBeta,
  tickToSecond,
  secondToTick,
  nearestTick,
  alignBeats,
  segmentRates,
} from "./ppqn.js";

// A wobbly "file" used by several tests below. Beat spacing is 0.6 s
// then 0.5 s, so the file's two segments run at 100 BPM and 120 BPM:
//   segmentBpm = 60 * (2 - 1) / (1.1 - 0.5) = 100
//   segmentBpm = 60 * (3 - 2) / (1.6 - 1.1) = 120
const FILE_MARKERS = [
  { beat: 1, second: 0.5 },
  { beat: 2, second: 1.1 },
  { beat: 3, second: 1.6 },
];

describe("tick <-> beta <-> second on a constant map", () => {
  it("tick 240 at PPQN 96 is beta 3.5, which is 1.75 s at 120 BPM", () => {
    // The chapter's worked number. 240 / 96 = 2.5 grid-beats past
    // tick 0, and tick 0 anchors at beat 1, so beta = 3.5. At 120 BPM
    // one beat is 0.5 s, so beta 3.5 sounds at 0.5 * 3.5 = 1.75 s.
    const map = constantMap(120);
    expect(betaForTick(240, 96)).toBe(3.5);
    expect(tickToSecond(240, 96, map)).toBeCloseTo(1.75, 12);
  });

  it("round trip: 1.75 s comes back as exactly tick 240 (as a float)", () => {
    // secondToTick is the exact inverse composition, so the same
    // second must land back on the same tick count — but as a float,
    // because quantizing is the caller's decision.
    const map = constantMap(120);
    expect(secondToTick(1.75, 96, map)).toBeCloseTo(240, 9);
    expect(tickForBeta(3.5, 96)).toBeCloseTo(240, 12);
  });

  it("PPQN independence: tick 240 @ 96 names the same moment as tick 1200 @ 480", () => {
    // PPQN is only a resolution. The same musical position carries a
    // different integer at a different resolution, but beta — and
    // therefore the second — must be identical.
    const map = constantMap(120);
    expect(betaForTick(1200, 480)).toBe(betaForTick(240, 96)); // both 3.5
    expect(tickToSecond(1200, 480, map)).toBeCloseTo(
      tickToSecond(240, 96, map),
      12
    );
  });
});

describe("ticks on a piecewise file map", () => {
  it("a tick past a tempo change uses the later segment's tempo", () => {
    // On FILE_MARKERS, tick 144 @ PPQN 96 is beta = 144/96 + 1 = 2.5 —
    // half a beat past beat 2, inside the 120 BPM segment. Seconds:
    // beat 2 sits at 1.1 s, and half a beat at 120 BPM is 0.25 s, so
    // 1.1 + 0.25 = 1.35 s.
    const map = piecewiseConstantMap(FILE_MARKERS);
    expect(betaForTick(144, 96)).toBe(2.5);
    expect(tickToSecond(144, 96, map)).toBeCloseTo(1.35, 12);
  });

  it("a tick before the tempo change uses the earlier segment's tempo", () => {
    // Tick 48 @ PPQN 96 is beta = 1.5 — half a beat past beat 1, inside
    // the 100 BPM segment (0.6 s per beat). Beat 1 sits at 0.5 s, so
    // 0.5 + 0.3 = 0.8 s.
    const map = piecewiseConstantMap(FILE_MARKERS);
    expect(tickToSecond(48, 96, map)).toBeCloseTo(0.8, 12);
  });
});

describe("nearestTick — snapping", () => {
  it("snaps a slightly-early second to the gridline it was aimed at", () => {
    // At 120 BPM and PPQN 96, 1.748 s is beta 3.496, i.e. tick
    // 239.616 — 0.384 ticks shy of tick 240. round answers "which tick
    // is nearest?", so the answer is 240, not floor's 239.
    const map = constantMap(120);
    expect(secondToTick(1.748, 96, map)).toBeCloseTo(239.616, 9);
    expect(nearestTick(1.748, 96, map)).toBe(240);
  });

  it("snaps a slightly-late second back to the same gridline", () => {
    // 1.752 s is tick 240.384; nearest is still 240. Early or late,
    // both sides of the gridline snap to it.
    const map = constantMap(120);
    expect(nearestTick(1.752, 96, map)).toBe(240);
  });
});

describe("warping a file onto a project grid", () => {
  it("alignBeats pairs each file marker with its project destination", () => {
    // Project at 120 BPM allots 0.5 s per beat, so beat n must sound
    // at 0.5 * n seconds. fileSecond is simply where the beat tracker
    // found each beat in the source audio.
    const aligned = alignBeats(FILE_MARKERS, 120);
    expect(aligned).toEqual([
      { beat: 1, fileSecond: 0.5, projectSecond: 0.5 },
      { beat: 2, fileSecond: 1.1, projectSecond: 1.0 },
      { beat: 3, fileSecond: 1.6, projectSecond: 1.5 },
    ]);
  });

  it("alignBeats does not mutate its input", () => {
    const input = [{ beat: 1, second: 0.5 }];
    const copy = JSON.parse(JSON.stringify(input));
    alignBeats(input, 120);
    expect(input).toEqual(copy);
  });

  it("segmentRates: the 100 BPM segment plays at 1.2, the 120 BPM segment at 1.0", () => {
    // rate = projectBpm / segmentBpm. The first segment was recorded
    // slower than the project (100 vs 120 BPM) so it must play faster:
    // 120 / 100 = 1.2. The second segment already matches: 1.0.
    const rates = segmentRates(FILE_MARKERS, 120);
    expect(rates).toHaveLength(2);
    expect(rates[0].fromBeat).toBe(1);
    expect(rates[0].toBeat).toBe(2);
    expect(rates[0].rate).toBeCloseTo(1.2, 12);
    expect(rates[1].fromBeat).toBe(2);
    expect(rates[1].toBeat).toBe(3);
    expect(rates[1].rate).toBeCloseTo(1.0, 12);
  });

  it("after warping, total duration is beats * 60 / projectBpm", () => {
    // The point of warping: on the project timeline, beat n sits at
    // exactly n * 60 / projectBpm seconds, wobble erased. With 3 beats
    // at 120 BPM the last beat lands at 3 * 0.5 = 1.5 s. Equivalently,
    // each warped segment occupies its source duration divided by its
    // rate: 0.6 / 1.2 + 0.5 / 1.0 = 0.5 + 0.5, one project beat each.
    const aligned = alignBeats(FILE_MARKERS, 120);
    const last = aligned[aligned.length - 1];
    expect(last.projectSecond).toBeCloseTo((3 * 60) / 120, 12);

    const rates = segmentRates(FILE_MARKERS, 120);
    const warpedSegmentTotal =
      (FILE_MARKERS[1].second - FILE_MARKERS[0].second) / rates[0].rate +
      (FILE_MARKERS[2].second - FILE_MARKERS[1].second) / rates[1].rate;
    expect(warpedSegmentTotal).toBeCloseTo(
      last.projectSecond - aligned[0].projectSecond,
      12
    );
  });
});

describe("validation", () => {
  it("rejects a non-positive or fractional PPQN", () => {
    expect(() => betaForTick(0, 0)).toThrow(/positive integer/);
    expect(() => betaForTick(0, -96)).toThrow(/positive integer/);
    expect(() => betaForTick(0, 96.5)).toThrow(/positive integer/);
  });

  it("rejects a fractional tick — ticks are integers by definition", () => {
    // beta accepts fractions freely; ticks do not. That distinction is
    // the entire point of PPQN, so betaForTick refuses to blur it.
    expect(() => betaForTick(240.5, 96)).toThrow(/integer/);
  });

  it("segmentRates requires at least 2 markers (a segment needs two ends)", () => {
    expect(() => segmentRates([{ beat: 1, second: 0.5 }], 120)).toThrow(
      /at least 2/
    );
    expect(() => segmentRates([], 120)).toThrow(/at least 2/);
  });

  it("alignBeats accepts a single marker — one pin is a valid alignment", () => {
    expect(alignBeats([{ beat: 1, second: 0.25 }], 120)).toEqual([
      { beat: 1, fileSecond: 0.25, projectSecond: 0.5 },
    ]);
  });
});
