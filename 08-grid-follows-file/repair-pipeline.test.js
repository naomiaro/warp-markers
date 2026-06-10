// ===========================================================================
// repair-pipeline.test.js -- issue #10 as a worked example, on real data.
//
// The "5/4 bar" chapter 08 derives from otherside.beats is a beat-tracker
// mistake: a ghost beat 100 ms after its neighbour. Repairing it takes no
// new machinery -- every chapter contributes the piece it was built for:
//
//   ch05 DETECTS   flagAnomalies fires on the 0.1 s gap (600 BPM)
//   ch06 LOCALIZES validateAgainstMeter names the 5-beat bar
//   ch06 REPAIRS   deleteBeat removes the ghost (which endpoint of the
//                  flagged gap is spurious is a judgement call -- decided
//                  here by which removal best restores the local tempo)
//   io   EXPORTS   exportBeatsTsv round-trips a clean .beats file
//   ch08 PROVES    gridPlanFromBeats on the repaired file collapses to a
//                  single 4/4 meter entry -- the phantom 5/4 is gone
//
// scar_tissue.beats carries the OTHER labeling defect: a final beat marked
// beatInBar=1, conjuring a phantom 1-beat bar. Its repair is ch06's
// relabelDownbeat -- a pure meter-layer edit, no tempo change at all.
// ===========================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { MeterMap } from "@dawcore/transport";
import { parseBeats, exportBeatsTsv } from "@warp-math/beats-io";
import { flagAnomalies } from "@warp-math/messy-data/robust.js";
import {
  deleteBeat,
  relabelDownbeat,
  validateAgainstMeter,
} from "@warp-math/repair/repair.js";
import { gridPlanFromBeats } from "./conform.js";

const PPQN = 960;

function readSample(name) {
  return readFileSync(
    fileURLToPath(new URL(`./public/samples/${name}`, import.meta.url)),
    "utf8"
  );
}

function load(name) {
  const parsed = parseBeats(readSample(name));
  return {
    parsed,
    markers: parsed.map((b, i) => ({ beat: i + 1, second: b.second })),
    timeOnly: parsed.map(({ second }) => ({ second })),
    downs: parsed.flatMap((b, i) => (b.beatInBar === 1 ? [i] : [])),
  };
}

// The flagged anomaly names a GAP (segment i = markers[i] -> markers[i+1]);
// either endpoint could be the ghost. Pick the one whose removal leaves the
// merged gap closest to the local tempo. Plain code, not a library function:
// per chapter 06's philosophy, this judgement belongs above the math layer.
function pickGhost(timeOnly, gapIndex) {
  const gaps = [];
  for (
    let k = Math.max(1, gapIndex - 4);
    k <= Math.min(timeOnly.length - 1, gapIndex + 5);
    k++
  ) {
    if (k !== gapIndex + 1) gaps.push(timeOnly[k].second - timeOnly[k - 1].second);
  }
  const local = gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  const dropLeft = timeOnly[gapIndex + 1].second - timeOnly[gapIndex - 1].second;
  const dropRight = timeOnly[gapIndex + 2].second - timeOnly[gapIndex].second;
  return Math.abs(dropLeft - local) < Math.abs(dropRight - local)
    ? gapIndex
    : gapIndex + 1;
}

describe("otherside: the 5/4 bar is a ghost beat, and the chapters repair it", () => {
  const { parsed, markers, timeOnly, downs } = load("otherside.beats");

  it("ch05 detects: the ghost's 0.1 s gap implies 600 BPM", () => {
    const flags = flagAnomalies(markers);
    const fast = flags.find((f) => f.kind === "too-fast");
    expect(fast).toBeDefined();
    expect(fast.index).toBe(55); // the gap markers[55] -> markers[56]
  });

  it("ch06 localizes: exactly one bad bar, with 5 beats", () => {
    const bad = validateAgainstMeter(timeOnly, downs, 4).filter(
      (b) => !b.ok && !b.isPickup
    );
    expect(bad).toHaveLength(1);
    expect(bad[0].beatCount).toBe(5);
    expect(bad[0].fromIndex).toBe(53);
  });

  it("the tempo-aware ghost choice picks the off-grid endpoint (idx 56, t=29.76)", () => {
    // markers[55] at 29.66 sits ON the ~0.52 s grid (29.12 + 0.54);
    // markers[56] at 29.76 does not. Deleting 56 restores 0.54 s gaps;
    // deleting 55 would leave a 0.64/0.44 wobble.
    expect(pickGhost(timeOnly, 55)).toBe(56);
  });

  it("repair -> export -> re-parse -> conform: the 5/4 meter entry vanishes", () => {
    const ghost = pickGhost(timeOnly, 55);
    const repaired = deleteBeat(timeOnly, downs, ghost);

    // ch06 re-validates clean AND ch05 re-detects clean -- both layers.
    expect(
      validateAgainstMeter(repaired.markers, repaired.downbeatIndices, 4).filter(
        (b) => !b.ok && !b.isPickup
      )
    ).toHaveLength(0);
    expect(
      flagAnomalies(repaired.markers.map((m, k) => ({ beat: k + 1, second: m.second })))
    ).toHaveLength(0);

    // Round-trip through the real file format, then conform (ch08):
    const tsv = exportBeatsTsv(repaired.markers, repaired.downbeatIndices);
    const plan = gridPlanFromBeats(parseBeats(tsv), PPQN);
    expect(plan.meterEntries).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);

    // And the production MeterMap agrees every downbeat is a bar line.
    const mm = new MeterMap(PPQN, 4, 4);
    for (const i of plan.downbeatIndices) {
      expect(mm.isBarBoundary(plan.firstBeatTick + i * PPQN)).toBe(true);
    }

    // The bundled repaired sample IS this pipeline's output, byte for byte.
    expect(readSample("otherside-repaired.beats")).toBe(tsv);
  });

  it("the unrepaired file still derives the phantom 5/4 (chapter 08 renders data faithfully)", () => {
    const plan = gridPlanFromBeats(parsed, PPQN);
    expect(plan.meterEntries.length).toBe(3);
    expect(plan.meterEntries[1].numerator).toBe(5);
  });
});

describe("scar_tissue: the phantom trailing 1-beat bar is a label, not a beat", () => {
  const { parsed, timeOnly, downs } = load("scar_tissue.beats");

  it("ch06 localizes a 1-beat bar at the very end", () => {
    const bad = validateAgainstMeter(timeOnly, downs, 4).filter(
      (b) => !b.ok && !b.isPickup
    );
    expect(bad).toHaveLength(1);
    expect(bad[0].beatCount).toBe(1);
    expect(bad[0].fromIndex).toBe(timeOnly.length - 2); // rows 308..309
  });

  it("ch05 sees nothing wrong -- the beat TIMES are fine; only the label lies", () => {
    const markers = parsed.map((b, i) => ({ beat: i + 1, second: b.second }));
    expect(flagAnomalies(markers)).toHaveLength(0);
  });

  it("relabelDownbeat repairs it without touching tempo space", () => {
    const lastIdx = timeOnly.length - 1;
    const repaired = relabelDownbeat(timeOnly, downs, lastIdx, false);
    expect(repaired.markers).toBe(timeOnly); // same reference -- no tempo edit

    expect(
      validateAgainstMeter(repaired.markers, repaired.downbeatIndices, 4).filter(
        (b) => !b.ok && !b.isPickup
      )
    ).toHaveLength(0);

    // Conform: the meter map collapses to plain 4/4.
    const tsv = exportBeatsTsv(repaired.markers, repaired.downbeatIndices);
    const plan = gridPlanFromBeats(parseBeats(tsv), PPQN);
    expect(plan.meterEntries).toEqual([{ tick: 0, numerator: 4, denominator: 4 }]);
  });
});
