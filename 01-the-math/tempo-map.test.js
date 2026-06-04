// ===========================================================================
// tempo-map.test.js   (run with: npx vitest)
//
// These tests double as worked examples. Each one states the property in
// words first, then checks it numerically.
// ===========================================================================

import { describe, it, expect } from "vitest";
import {
  constantMap,
  piecewiseConstantMap,
  linearRampMap,
  segmentBpm,
} from "./tempo-map.js";
import { pin, describePin } from "./warp-marker.js";

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

describe("constant tempo", () => {
  it("120 BPM puts 8 beats at exactly 4 seconds", () => {
    // 120 BPM = 2 beats/sec, so 8 beats = 4 s.
    const map = constantMap(120);
    expect(close(map.beatsToSeconds(8), 4)).toBe(true);
  });

  it("round-trips beats -> seconds -> beats", () => {
    const map = constantMap(143);
    expect(close(map.secondsToBeats(map.beatsToSeconds(5.5)), 5.5)).toBe(true);
  });
});

describe("piecewise-constant tempo (beat_this style)", () => {
  // Markers: steady 120 BPM (0.5 s/beat) for 4 beats, then 60 BPM (1 s/beat).
  const markers = [
    { beat: 0, second: 0 },
    { beat: 4, second: 2 }, // 4 beats in 2 s -> 120 BPM
    { beat: 8, second: 6 }, // next 4 beats in 4 s -> 60 BPM
  ];
  const map = piecewiseConstantMap(markers);

  it("derives the right tempo per segment", () => {
    expect(close(segmentBpm(markers[0], markers[1]), 120)).toBe(true);
    expect(close(segmentBpm(markers[1], markers[2]), 60)).toBe(true);
  });

  it("a beat inside the second segment lands correctly", () => {
    // beat 6 = 2 beats into the 60 BPM (1 s/beat) section after the 2 s mark
    expect(close(map.beatsToSeconds(6), 4)).toBe(true);
  });

  it("round-trips through the kink", () => {
    expect(close(map.secondsToBeats(map.beatsToSeconds(6.3)), 6.3)).toBe(true);
  });

  it("equal intervals collapse to the constant case", () => {
    // If every segment is the same tempo, the piecewise map must agree with
    // constantMap exactly -- a good sanity check that the sum is doing the
    // same thing as the closed form.
    const steady = piecewiseConstantMap([
      { beat: 0, second: 0 },
      { beat: 4, second: 2 },
      { beat: 8, second: 4 },
    ]);
    const cst = constantMap(120);
    for (const b of [0, 1, 3.7, 8]) {
      expect(close(steady.beatsToSeconds(b), cst.beatsToSeconds(b))).toBe(true);
    }
  });
});

describe("linear tempo ramp (the logarithm)", () => {
  const map = linearRampMap(120, 240, 8); // double the tempo over 8 beats

  it("round-trips beats -> seconds -> beats", () => {
    for (const b of [0.5, 2, 5, 8]) {
      expect(close(map.secondsToBeats(map.beatsToSeconds(b)), b)).toBe(true);
    }
  });

  it("a true ramp is NOT linear in time (this is the whole point)", () => {
    // If the time map were a straight line, the midpoint beat would land at
    // exactly half the total time. The log map puts it LATER than half,
    // because early beats are slower. We assert the gap is real.
    const total = map.beatsToSeconds(8);
    const mid = map.beatsToSeconds(4);
    expect(mid).toBeGreaterThan(total / 2);
  });

  it("matches the constant case when start == end", () => {
    const flat = linearRampMap(150, 150, 8);
    const cst = constantMap(150);
    expect(close(flat.beatsToSeconds(8), cst.beatsToSeconds(8))).toBe(true);
  });
});

describe("pinning", () => {
  const base = [
    { beat: 0, second: 0 },
    { beat: 4, second: 2 },
    { beat: 8, second: 4 },
  ];

  it("moving a marker changes both adjacent derived tempos", () => {
    // Drag beat 4 from second 2 to second 2.5: the incoming segment gets
    // slower (more seconds for the same 4 beats) and the outgoing gets faster.
    const before = describePin(base, 4);
    const moved = pin(base, 4, 2.5);
    const after = describePin(moved, 4);
    expect(after.incomingBpm).toBeLessThan(before.incomingBpm);
    expect(after.outgoingBpm).toBeGreaterThan(before.outgoingBpm);
  });

  it("rejects a pin that makes time run backwards", () => {
    // Beat 4 cannot sit at 5 s when beat 8 is already pinned at 4 s.
    expect(() => pin(base, 4, 5)).toThrow();
  });

  it("downstream beats shift in absolute seconds (drift is global)", () => {
    const map0 = piecewiseConstantMap(base);
    const map1 = piecewiseConstantMap(pin(base, 4, 2.5));
    // beat 8's second is fixed by its own marker, but a beat between 4 and 8
    // moves because the segment it lives in was rescaled.
    expect(map0.beatsToSeconds(6)).not.toBe(map1.beatsToSeconds(6));
  });
});
