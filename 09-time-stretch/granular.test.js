// =====================================================================
// 09 · granular.test.js — the worked examples
// =====================================================================
//
// The fixture throughout is the repo's wobbly file: beats 1..16, the
// first at 0.25 s, then gaps of 4 x 0.6 s, 4 x 0.5 s, 4 x 0.4 s,
// 3 x 0.5 s — segments at 100, 120, 150, 120 BPM. The project runs at
// 120 BPM (0.5 s per beat), so the per-segment rates are 1.2, 1.0,
// 0.8, 1.0 and the anchors sit at projectSecond = 0.5 * beat.

import { describe, it, expect } from "vitest";
import { alignBeats, segmentRates } from "@warp-math/ppqn-grid/ppqn.js";
import {
  stretchPlan,
  sourcePositionAt,
  grainSchedule,
  grainGainAt,
} from "./granular.js";

// Build the fixture by accumulation, exactly as a beat tracker's
// output would arrive — 16 markers, 15 gaps.
function wobblyMarkers() {
  const gaps = [
    0.6, 0.6, 0.6, 0.6,
    0.5, 0.5, 0.5, 0.5,
    0.4, 0.4, 0.4, 0.4,
    0.5, 0.5, 0.5,
  ];
  const markers = [{ beat: 1, second: 0.25 }];
  for (let i = 0; i < gaps.length; i += 1) {
    markers.push({
      beat: markers[i].beat + 1,
      second: markers[i].second + gaps[i],
    });
  }
  return markers;
}

const PROJECT_BPM = 120;

describe("stretchPlan", () => {
  it("delegates to chapter 07 verbatim: anchors and rates equal alignBeats / segmentRates on the wobbly fixture", () => {
    const markers = wobblyMarkers();
    const plan = stretchPlan(markers, PROJECT_BPM);

    expect(plan.anchors).toEqual(alignBeats(markers, PROJECT_BPM));
    expect(plan.rates).toEqual(segmentRates(markers, PROJECT_BPM));
    expect(plan.projectBpm).toBe(PROJECT_BPM);

    // Spot-check the table the rest of the suite leans on.
    expect(plan.anchors[0]).toEqual({ beat: 1, fileSecond: 0.25, projectSecond: 0.5 });
    expect(plan.rates[0].rate).toBeCloseTo(1.2, 12);
    expect(plan.rates[4].rate).toBeCloseTo(1.0, 12);
    expect(plan.rates[8].rate).toBeCloseTo(0.8, 12);
    expect(plan.rates[14].rate).toBeCloseTo(1.0, 12);
  });

  it("does not mutate the input markers", () => {
    const markers = wobblyMarkers();
    const copy = JSON.parse(JSON.stringify(markers));
    stretchPlan(markers, PROJECT_BPM);
    expect(markers).toEqual(copy);
  });
});

describe("sourcePositionAt — the source-position function s(p)", () => {
  const plan = stretchPlan(wobblyMarkers(), PROJECT_BPM);

  it("is exact at every one of the 16 anchors: s(projectSecond_n) === fileSecond_n", () => {
    for (const anchor of plan.anchors) {
      // Strict equality, not toBeCloseTo: at an anchor the rate term
      // multiplies an exact zero, so no float fuzz is admissible.
      expect(sourcePositionAt(plan, anchor.projectSecond)).toBe(anchor.fileSecond);
    }
  });

  it("advances at the segment rate between anchors: s(0.75) = 0.25 + 1.2 * 0.25 = 0.55", () => {
    // p = 0.75 is mid-segment-1 (rate 1.2), a quarter project-second
    // past beat 1's anchor at (projectSecond 0.5, fileSecond 0.25).
    expect(sourcePositionAt(plan, 0.75)).toBeCloseTo(0.55, 12);
  });

  it("extrapolates the FIRST segment's rate backwards before the first anchor", () => {
    // p = 0.3 is 0.2 s before the first anchor; at rate 1.2 the line
    // runs back to 0.25 - 1.2 * 0.2 = 0.01.
    expect(sourcePositionAt(plan, 0.3)).toBeCloseTo(0.01, 12);
  });

  it("extrapolates the LAST segment's rate forwards past the last anchor", () => {
    // Last anchor: beat 16 at projectSecond 8.0, fileSecond 7.75
    // (0.25 + 4*0.6 + 4*0.5 + 4*0.4 + 3*0.5). Last rate 1.0, so
    // s(8.5) = 7.75 + 1.0 * 0.5 = 8.25.
    expect(sourcePositionAt(plan, 8.5)).toBeCloseTo(8.25, 12);
  });

  it("rejects a non-finite p", () => {
    expect(() => sourcePositionAt(plan, NaN)).toThrow(/finite/);
    expect(() => sourcePositionAt(plan, Infinity)).toThrow(/finite/);
  });
});

describe("grainSchedule — the grain-advance rule", () => {
  const plan = stretchPlan(wobblyMarkers(), PROJECT_BPM);

  it("worked pair from the chapter: grain at outputSec 0.5 reads 0.25; the next at 0.54 reads 0.298", () => {
    const grains = grainSchedule(plan, { fromSec: 0.5, toSec: 8.0 });
    expect(grains[0].outputSec).toBeCloseTo(0.5, 12);
    expect(grains[0].sourceSec).toBeCloseTo(0.25, 12);
    expect(grains[1].outputSec).toBeCloseTo(0.54, 12);
    // 0.25 + 1.2 * 0.04 — the grain-advance rule in numbers.
    expect(grains[1].sourceSec).toBeCloseTo(0.298, 12);
  });

  it("consecutive grains advance the source by outputHop * rate within the rate-1.2 block (beats 1–5)", () => {
    const hop = 0.08 * (1 - 0.5); // 0.04
    const grains = grainSchedule(plan, { fromSec: 0.5, toSec: 8.0 });
    // Beats 1–5 occupy project time [0.5, 2.5); pairs strictly inside
    // that span must each show a source delta of 0.04 * 1.2 = 0.048.
    const block = grains.filter((g) => g.outputSec >= 0.5 && g.outputSec < 2.5 - hop);
    expect(block.length).toBeGreaterThan(10);
    for (let i = 0; i + 1 < block.length; i += 1) {
      const delta = block[i + 1].sourceSec - block[i].sourceSec;
      expect(delta).toBeCloseTo(hop * 1.2, 12);
    }
  });

  it("consecutive grains advance the source by outputHop * rate within the rate-0.8 block (beats 9–13)", () => {
    const hop = 0.04;
    const grains = grainSchedule(plan, { fromSec: 0.5, toSec: 8.0 });
    // Beats 9–13 occupy project time [4.5, 6.5).
    const block = grains.filter((g) => g.outputSec >= 4.5 && g.outputSec < 6.5 - hop);
    expect(block.length).toBeGreaterThan(10);
    for (let i = 0; i + 1 < block.length; i += 1) {
      const delta = block[i + 1].sourceSec - block[i].sourceSec;
      expect(delta).toBeCloseTo(hop * 0.8, 12);
    }
  });

  it("every grain has durationSec === grainSec and per-grain pitch is implied 1.0 (no rate field to bend)", () => {
    const grains = grainSchedule(plan, { grainSec: 0.06, overlap: 0.5, toSec: 2.0 });
    for (const g of grains) {
      expect(g.durationSec).toBe(0.06);
      expect(Object.keys(g).sort()).toEqual(["durationSec", "outputSec", "sourceSec"]);
    }
  });
});

describe("beat alignment — the chapter's point", () => {
  const plan = stretchPlan(wobblyMarkers(), PROJECT_BPM);

  it("for every anchor there is a grain within one hop of its projectSecond, and s() hits the anchor's fileSecond exactly", () => {
    const hop = 0.04;
    const grains = grainSchedule(plan, { fromSec: 0, toSec: 8.5 });
    for (const anchor of plan.anchors) {
      const nearest = grains.reduce((best, g) =>
        Math.abs(g.outputSec - anchor.projectSecond) < Math.abs(best.outputSec - anchor.projectSecond) ? g : best
      );
      expect(Math.abs(nearest.outputSec - anchor.projectSecond)).toBeLessThanOrEqual(hop);
      // The warp function itself is exact at the beat, regardless of
      // where the grain lattice happens to fall.
      expect(sourcePositionAt(plan, anchor.projectSecond)).toBe(anchor.fileSecond);
    }
  });
});

describe("grainGainAt — Hann window and COLA", () => {
  it("is zero at both grain edges (no clicks) and follows the raised cosine inside", () => {
    expect(grainGainAt(0)).toBeCloseTo(0, 12);
    expect(grainGainAt(1)).toBeCloseTo(0, 12);
    expect(grainGainAt(0.25)).toBeCloseTo(0.5, 12);
    expect(grainGainAt(0.5)).toBeCloseTo(1, 12);
  });

  it("is zero outside [0, 1]", () => {
    expect(grainGainAt(-0.1)).toBe(0);
    expect(grainGainAt(1.1)).toBe(0);
  });

  it("sums to a constant 1 at 50% overlap (COLA): w(x) + w(x + 1/2) = 1 for all x in [0, 0.5]", () => {
    for (const x of [0, 0.05, 0.1, 0.125, 0.2, 0.25, 0.3, 0.4, 0.45, 0.5]) {
      expect(grainGainAt(x) + grainGainAt(x + 0.5)).toBeCloseTo(1, 12);
    }
  });
});

describe("coverage of the output span", () => {
  const plan = stretchPlan(wobblyMarkers(), PROJECT_BPM);

  it("covers [fromSec, toSec): first grain at fromSec, last within one hop of toSec, count = ceil(span / hop)", () => {
    const hop = 0.04;
    const toSec = 8.5;
    const grains = grainSchedule(plan, { toSec });

    expect(grains[0].outputSec).toBe(0);
    const last = grains[grains.length - 1];
    expect(last.outputSec).toBeLessThan(toSec);
    expect(toSec - last.outputSec).toBeLessThanOrEqual(hop);
    expect(grains.length).toBe(Math.ceil((toSec - 0) / hop)); // 213
    expect(grains.length).toBe(213);
  });
});

describe("validation", () => {
  const plan = stretchPlan(wobblyMarkers(), PROJECT_BPM);

  it("rejects overlap 0 and overlap 1 (the open interval is strict)", () => {
    expect(() => grainSchedule(plan, { overlap: 0, toSec: 1 })).toThrow(/overlap/);
    expect(() => grainSchedule(plan, { overlap: 1, toSec: 1 })).toThrow(/overlap/);
  });

  it("rejects grainSec 0", () => {
    expect(() => grainSchedule(plan, { grainSec: 0, toSec: 1 })).toThrow(/grainSec/);
  });

  it("rejects a missing toSec", () => {
    expect(() => grainSchedule(plan, {})).toThrow(/toSec/);
  });

  it("rejects toSec <= fromSec", () => {
    expect(() => grainSchedule(plan, { fromSec: 2, toSec: 2 })).toThrow(/toSec/);
  });

  it("bubbles chapter 07's validation: fewer than 2 markers throws from stretchPlan", () => {
    expect(() => stretchPlan([{ beat: 1, second: 0.25 }], PROJECT_BPM)).toThrow();
    expect(() => stretchPlan([], PROJECT_BPM)).toThrow();
  });
});
