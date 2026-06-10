// ===========================================================================
// repair.test.js -- worked examples for the hand-edit operations
// ===========================================================================
import { describe, it, expect } from "vitest";
import {
  deleteBeat,
  insertBeat,
  moveBeat,
  validateAgainstMeter,
  recoverDownbeats,
  relabelDownbeat,
} from "./repair.js";
import { parseBeats, exportBeatsTsv } from "@warp-math/beats-io";

// Helper: build a clean steady-tempo marker array of n beats at 120 BPM,
// with downbeats every `barLen` beats starting at index 0.
function cleanBars(n, barLen = 4) {
  const markers = [];
  for (let i = 0; i < n; i++) markers.push({ second: i * 0.5 });
  const downs = [];
  for (let i = 0; i < n; i += barLen) downs.push(i);
  return { markers, downbeatIndices: downs };
}

describe("extra-beat repair (deleteBeat)", () => {
  it("flags a bar with 5 beats then deletes the spurious one", () => {
    // 4/4 with one extra beat inserted between index 2 and 3, so bar 1
    // (beats 0..4 inclusive of the spurious one) ends up with 5 beats.
    //
    //   indices: 0  1  2  X  3  4  5  6  7
    //   times:   0  .5 1  1.25 1.5 2  2.5 3  3.5
    //   downs:   0           ^4   (was 4 pre-insert, now shifted to 5)
    //
    // We build it AS IF it came from a tracker that emitted an extra row.
    const markers = [
      { second: 0.0 }, { second: 0.5 }, { second: 1.0 }, { second: 1.25 },
      { second: 1.5 }, { second: 2.0 }, { second: 2.5 }, { second: 3.0 },
      { second: 3.5 },
    ];
    const downs = [0, 5]; // beats 0 and "what used to be beat 4" (now shifted)

    const before = validateAgainstMeter(markers, downs, 4);
    // Bar 1 spans indices 0..4 (downbeat at 0, next downbeat at 5) -> 5 beats
    const bar1Before = before.find((b) => b.bar === 1);
    expect(bar1Before.beatCount).toBe(5);
    expect(bar1Before.ok).toBe(false);

    // Repair: delete the spurious beat (index 3, the one at t=1.25).
    const after = deleteBeat(markers, downs, 3);
    expect(after.markers.length).toBe(8);
    // Downbeat at original index 5 must shift down to 4 (a downbeat that
    // came AFTER the deleted index moves one step earlier in absolute
    // beat-index space). The "subtle bug" the brief calls out.
    expect(after.downbeatIndices).toEqual([0, 4]);

    const fixed = validateAgainstMeter(after.markers, after.downbeatIndices, 4);
    const bar1After = fixed.find((b) => b.bar === 1);
    expect(bar1After.beatCount).toBe(4);
    expect(bar1After.ok).toBe(true);
  });

  it("deletes a downbeat and removes it from the downbeat set", () => {
    const { markers, downbeatIndices } = cleanBars(8); // downs [0, 4]
    const after = deleteBeat(markers, downbeatIndices, 4);
    // The downbeat at 4 is gone; downstream there are no more downbeats
    // so the set keeps just [0].
    expect(after.downbeatIndices).toEqual([0]);
  });
});

describe("dropped-beat repair (insertBeat)", () => {
  it("flags a bar with 3 beats then inserts the missing one at the gap midpoint", () => {
    // 4/4 but the tracker dropped beat 2: only 3 beats in bar 1.
    //
    //   indices: 0  1  2  3  4  5
    //   times:   0  .5 1.5 2  2.5 3
    //                ^ gap from t=0.5 to t=1.5 (1.0 s wide instead of 0.5)
    //   downs:   0           ^3
    const markers = [
      { second: 0.0 }, { second: 0.5 }, { second: 1.5 },
      { second: 2.0 }, { second: 2.5 }, { second: 3.0 },
    ];
    const downs = [0, 3];

    const before = validateAgainstMeter(markers, downs, 4);
    const bar1Before = before.find((b) => b.bar === 1);
    expect(bar1Before.beatCount).toBe(3);
    expect(bar1Before.ok).toBe(false);

    // Repair: insert a beat at the gap midpoint (t=1.0).
    const after = insertBeat(markers, downs, 1.0);
    expect(after.insertedAt).toBe(2);
    expect(after.downbeatIndices).toEqual([0, 4]); // downbeat shifts up
    expect(after.markers.map((m) => m.second)).toEqual([
      0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0,
    ]);

    const fixed = validateAgainstMeter(after.markers, after.downbeatIndices, 4);
    expect(fixed.find((b) => b.bar === 1).ok).toBe(true);
  });

  it("rejects an insert that duplicates an existing time", () => {
    const { markers, downbeatIndices } = cleanBars(4);
    expect(() => insertBeat(markers, downbeatIndices, 0.5)).toThrow(/already exists/);
  });
});

describe("mistimed-beat repair (moveBeat)", () => {
  it("accepts a valid nudge", () => {
    const { markers } = cleanBars(4);
    // Nudge beat 2 from t=1.0 to t=1.05 -- still strictly between 0.5 and 1.5.
    const moved = moveBeat(markers, 2, 1.05);
    expect(moved[2].second).toBeCloseTo(1.05, 6);
    // Other beats untouched.
    expect(moved[1].second).toBe(0.5);
    expect(moved[3].second).toBe(1.5);
  });

  it("rejects a non-monotonic move", () => {
    const { markers } = cleanBars(4);
    // Try to push beat 2 to t=2.0 (past beat 3 at t=1.5).
    expect(() => moveBeat(markers, 2, 2.0)).toThrow();
  });
});

describe(".beats round-trip", () => {
  it("parse -> export -> parse is identity on the bundled fixture", () => {
    // Same shape as the chapter-03 sample.
    const text = [
      "0.250000\t3",
      "0.750000\t4",
      "1.250000\t1",
      "1.750000\t2",
      "2.250000\t3",
      "2.750000\t4",
      "3.250000\t1",
      "",
    ].join("\n");
    const parsed = parseBeats(text);
    const downs = recoverDownbeats(parsed);
    const markers = parsed.map(({ second }) => ({ second }));
    const exported = exportBeatsTsv(markers, downs);
    const reparsed = parseBeats(exported);
    expect(reparsed.length).toBe(parsed.length);
    for (let i = 0; i < parsed.length; i++) {
      expect(Math.abs(reparsed[i].second - parsed[i].second)).toBeLessThan(1e-6);
      expect(reparsed[i].beatInBar).toBe(parsed[i].beatInBar);
    }
  });
});

describe("relabelDownbeat (the meter-layer-only repair)", () => {
  // A beat whose time is right but whose downbeat flag is wrong needs no
  // tempo edit at all -- the markers pass through IDENTICALLY (same
  // reference: nothing in tempo space changed), only the label set is
  // rebuilt.
  const markers = [0, 0.5, 1.0, 1.5, 2.0, 2.5].map((second) => ({ second }));

  it("removes a wrong downbeat label, leaving markers untouched", () => {
    const out = relabelDownbeat(markers, [0, 4, 5], 5, false);
    expect(out.downbeatIndices).toEqual([0, 4]);
    expect(out.markers).toBe(markers); // same reference: tempo space untouched
  });

  it("adds a missing downbeat label, kept sorted", () => {
    const out = relabelDownbeat(markers, [0, 4], 2, true);
    expect(out.downbeatIndices).toEqual([0, 2, 4]);
  });

  it("is a no-op when the label already matches, and never mutates input", () => {
    const downs = [0, 4];
    const out = relabelDownbeat(markers, downs, 4, true);
    expect(out.downbeatIndices).toEqual([0, 4]);
    expect(downs).toEqual([0, 4]);
    const out2 = relabelDownbeat(markers, downs, 2, true);
    expect(downs).toEqual([0, 4]); // input array not mutated
    expect(out2.downbeatIndices).not.toBe(downs);
  });

  it("rejects an out-of-range index", () => {
    expect(() => relabelDownbeat(markers, [0], 6, true)).toThrow(/out of range/);
  });
});
