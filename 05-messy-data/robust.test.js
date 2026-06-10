// ===========================================================================
// robust.test.js   (run with: npx vitest)
//
// Worked-example style: each test states the property in words, then builds
// a synthetic fixture and checks the detector flags the expected anomaly.
// All fixtures are inline -- no audio, no .beats files, no I/O.
// ===========================================================================

import { describe, it, expect } from "vitest";
import {
  instantaneousBpms,
  flagAnomalies,
  monotonicityHoles,
} from "./robust.js";

// Build a clean 120 BPM marker list (0.5 s per beat) of `n` segments.
// Beat numbers are 1-indexed (a beat map never has a beat 0).
function steady120(n) {
  const m = new Array(n + 1);
  for (let i = 0; i <= n; i++) m[i] = { beat: i + 1, second: i * 0.5 };
  return m;
}

describe("instantaneousBpms (the raw signal)", () => {
  it("reports the per-segment BPM along a steady track", () => {
    // 120 BPM means 0.5 s per beat. Every segment's BPM should be 120.
    const bpms = instantaneousBpms(steady120(8));
    expect(bpms.length).toBe(8);
    for (const b of bpms) expect(Math.abs(b - 120)).toBeLessThan(1e-6);
  });

  it("yields NaN at a non-monotonic step rather than throwing", () => {
    // The point: detection should still run on partially broken data, so the
    // monotonicity hole tool can find the offender. Mixing throwing into the
    // BPM computation would mask everything after the first violation.
    const m = [
      { beat: 1, second: 0 },
      { beat: 2, second: 0.5 },
      { beat: 3, second: 0.4 }, // backwards
      { beat: 4, second: 0.9 },
    ];
    const bpms = instantaneousBpms(m);
    expect(Number.isNaN(bpms[1])).toBe(true);
    expect(Number.isFinite(bpms[0])).toBe(true);
    expect(Number.isFinite(bpms[2])).toBe(true);
  });
});

describe("flagAnomalies", () => {
  it("flags nothing on a clean steady track (default thresholds)", () => {
    // 120 BPM falls well inside [30, 300] and adjacent segments are identical
    // so no jump should fire either. The detector exists to be quiet here.
    expect(flagAnomalies(steady120(16))).toEqual([]);
  });

  it("flags a dropped-beat fixture as too-slow (or jump)", () => {
    // A dropped beat between marker 3 and marker 4: the recorder went on as
    // if nothing happened, so the gap to the next detected beat is roughly
    // doubled. With segment width going from 0.5 s to 1.0 s, the implied
    // BPM drops from 120 to 60 (still inside the wide [30,300] default
    // band -- so we deliberately tighten the lower threshold here and also
    // assert the jump detector catches it independently).
    const m = steady120(8);
    // Move marker 4 onward by 0.5 s, simulating that the next beat after
    // index 3 is missing (the gap to marker 4 widens to 1.0 s).
    for (let i = 4; i <= 8; i++) m[i] = { ...m[i], second: m[i].second + 0.5 };

    // Default thresholds: 60 BPM is fine, but the jump detector should still
    // see the 120 -> 60 transition (ratio 0.5) and flag the segment.
    const defaults = flagAnomalies(m);
    expect(defaults.some((f) => f.kind === "jump" && f.index === 3)).toBe(true);

    // And with a tightened low-BPM band, "too-slow" appears too.
    const tighter = flagAnomalies(m, { lowBpm: 80 });
    expect(tighter.some((f) => f.kind === "too-slow")).toBe(true);
  });

  it("flags a doubled-beat fixture as too-fast (or jump)", () => {
    // A spurious extra beat inserted between marker 3 and what would have
    // been marker 4: the gap is halved. From 0.5 s to 0.25 s the implied
    // BPM doubles, 120 -> 240. Still inside the default band -- jump
    // catches it; tightening the high-BPM ceiling catches "too-fast".
    const m = steady120(8);
    // Squeeze marker 4 to halfway between markers 3 and the old 4.
    m[4] = { ...m[4], second: m[3].second + 0.25 };

    const defaults = flagAnomalies(m);
    expect(defaults.some((f) => f.kind === "jump" && f.index === 3)).toBe(true);

    const tighter = flagAnomalies(m, { highBpm: 200 });
    expect(tighter.some((f) => f.kind === "too-fast")).toBe(true);
  });
});

describe("monotonicityHoles (the fatal kind)", () => {
  it("returns [] for a clean marker list", () => {
    // A clean track has no holes -- the warp map is invertible end to end.
    expect(monotonicityHoles(steady120(8))).toEqual([]);
  });

  it("catches a non-monotonic marker", () => {
    // Marker 3 sits at an earlier second than marker 2 -- the warp map's
    // inverse is no longer well-defined at that t. This is the failure
    // chapter 01 explicitly guards against (`pin` rejects it; here we
    // detect it after the fact).
    const m = [
      { beat: 1, second: 0 },
      { beat: 2, second: 0.5 },
      { beat: 3, second: 1.0 },
      { beat: 4, second: 0.9 }, // backwards in seconds
      { beat: 5, second: 2.0 },
    ];
    expect(monotonicityHoles(m)).toEqual([3]);
  });

  it("catches a non-monotonic BEAT axis too", () => {
    // Less common in practice, but the math layer's contract requires both
    // axes strictly increasing. Worth flagging the same way.
    const m = [
      { beat: 1, second: 0 },
      { beat: 3, second: 1 },
      { beat: 2, second: 2 }, // beat went backwards
    ];
    expect(monotonicityHoles(m)).toEqual([2]);
  });
});
