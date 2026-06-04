// ===========================================================================
// meter.test.js   (run with: npx vitest)
//
// These tests double as worked examples for the meter layer, in the same
// style as 01-the-math/tempo-map.test.js: state the property in words first,
// then check it numerically.
// ===========================================================================

import { describe, it, expect } from "vitest";
import {
  barPositionOf,
  clickForBeat,
  meterMapFromBeats,
} from "./meter.js";

describe("steady 4/4", () => {
  const m = [{ fromBeat: 0, beatsPerBar: 4 }];

  it("marks 0, 4, 8 as downbeats and 1, 2, 3, 5 as not", () => {
    for (const b of [0, 4, 8]) {
      expect(barPositionOf(m, b).isDownbeat).toBe(true);
    }
    for (const b of [1, 2, 3, 5]) {
      expect(barPositionOf(m, b).isDownbeat).toBe(false);
    }
  });

  it("positionInBar cycles 0,1,2,3 across the first eight beats", () => {
    // The whole meter layer in one line: positionInBar = beatIndex % 4.
    // Spelling it out as a sequence makes that cycle visible.
    const expected = [0, 1, 2, 3, 0, 1, 2, 3];
    for (let i = 0; i < expected.length; i++) {
      expect(barPositionOf(m, i).positionInBar).toBe(expected[i]);
    }
  });
});

describe("meter changes mid-sequence", () => {
  // Two bars of 4/4 (beats 0..7), then three-beat bars (beats 8, 9, 10 -> bar;
  // 11, 12, 13 -> next bar; ...). The point of the test: the bar count must be
  // continuous across the change -- no double-counting, no missed bar.
  const m = [
    { fromBeat: 0, beatsPerBar: 4 },
    { fromBeat: 8, beatsPerBar: 3 },
  ];

  it("beat 8 (start of new meter) is a downbeat", () => {
    const r = barPositionOf(m, 8);
    expect(r.isDownbeat).toBe(true);
    expect(r.positionInBar).toBe(0);
  });

  it("beat 11 is the next downbeat (8 + 3)", () => {
    const r = barPositionOf(m, 11);
    expect(r.isDownbeat).toBe(true);
    expect(r.positionInBar).toBe(0);
  });

  it("beat 10 is NOT a downbeat (position 2 of bar)", () => {
    const r = barPositionOf(m, 10);
    expect(r.isDownbeat).toBe(false);
    expect(r.positionInBar).toBe(2);
  });

  it("bar count is continuous across the meter change", () => {
    // Bars 0 and 1 cover beats 0..7 (two 4-beat bars). Bar 2 must start at
    // beat 8 (no gap, no overlap) and bar 3 at beat 11 (one 3-beat bar
    // later). If the implementation forgot to roll barsBefore into the new
    // segment, you'd see bar reset to 0 here instead of continuing at 2.
    expect(barPositionOf(m, 0).bar).toBe(0);
    expect(barPositionOf(m, 7).bar).toBe(1); // last beat of bar 1 (4/4)
    expect(barPositionOf(m, 8).bar).toBe(2); // first beat of bar 2 (3/4)
    expect(barPositionOf(m, 10).bar).toBe(2); // last beat of bar 2
    expect(barPositionOf(m, 11).bar).toBe(3); // first beat of bar 3
  });
});

describe("clickForBeat", () => {
  const m = [{ fromBeat: 0, beatsPerBar: 4 }];

  it("returns 'accent' exactly on downbeats and 'normal' on the others", () => {
    // This is the entire meter layer as a metronome would see it: one boolean
    // classification per beat, accent vs normal. If this is right, the audio
    // engine has nothing else to ask the meter layer.
    expect(clickForBeat(m, 0)).toBe("accent");
    expect(clickForBeat(m, 4)).toBe("accent");
    for (const b of [1, 2, 3, 5, 6, 7]) {
      expect(clickForBeat(m, b)).toBe("normal");
    }
  });
});

describe("meterMapFromBeats (deriving meter from beat_this output)", () => {
  it("recovers '4 then 3' from a synthetic spacing change", () => {
    // 12 beats at 0.5 s apart. Downbeats fall at beats 0, 4, 8 (still 4-spaced)
    // and then at beats 11, 14 (3-spaced) -- i.e. the gap narrows from 4 to 3
    // partway through. The brief's reference impl records a meter change only
    // when consecutive downbeat GAPS differ, so we expect two entries.
    const beats = Array.from({ length: 16 }, (_, i) => +(i * 0.5).toFixed(6));
    const downbeats = [0, 2, 4, 5.5, 7].map((s) => +s.toFixed(6));
    //   indices:   0, 4, 8, 11, 14  -> gaps: 4, 4, 3, 3
    const map = meterMapFromBeats(beats, downbeats);

    // Two segments expected: 4/4 from beat 0, then 3/something from beat 8.
    expect(map.length).toBe(2);
    expect(map[0]).toEqual({ fromBeat: 0, beatsPerBar: 4 });
    expect(map[1]).toEqual({ fromBeat: 8, beatsPerBar: 3 });

    // And the derived meter classifies the downbeats correctly:
    expect(barPositionOf(map, 0).isDownbeat).toBe(true);
    expect(barPositionOf(map, 4).isDownbeat).toBe(true);
    expect(barPositionOf(map, 8).isDownbeat).toBe(true);
    expect(barPositionOf(map, 11).isDownbeat).toBe(true);
    expect(barPositionOf(map, 10).isDownbeat).toBe(false);
  });
});
