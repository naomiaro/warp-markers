// ============================================================================
// 10 · bars-bastard.test.js — the real file, all 73 meter regions
//
// The synthetic fixture in bars.test.js is a miniature; this is the real
// thing. Ben Folds' "Bastard" (bundled with chapter 08's demo): 454 beats,
// 171 declared downbeats, 73 meter regions, bars of 1 to 7 beats. The meter
// entries come from chapter 08's gridPlanFromBeats — the same entries its
// demo feeds the transport — and the closing assertion is the chapter's
// thesis at full scale: barForTick, ten lines of pure arithmetic, recovers
// the file's OWN beatInBar column, row for row, and agrees with the
// production MeterMap everywhere.
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { MeterMap } from "@dawcore/transport";
import { parseBeats } from "@warp-math/beats-io";
import { gridPlanFromBeats } from "@warp-math/grid-follows-file/conform.js";
import { barAtlas, barForTick, tickForBar, isBarStart } from "./bars.js";

const PPQN = 960;

// The fixture lives with chapter 08's demo samples (single source of truth;
// this is a monorepo-internal read, same pattern as the repair pipeline).
const parsed = parseBeats(
  readFileSync(
    fileURLToPath(
      new URL("../08-grid-follows-file/public/samples/bastard.beats", import.meta.url)
    ),
    "utf8"
  )
);
const plan = gridPlanFromBeats(parsed, PPQN);

describe("bastard.beats through the atlas", () => {
  it("the 73 meter entries from chapter 08 build a valid atlas (every change on a bar boundary)", () => {
    // barAtlas validates what gridPlanFromBeats promises: each entry's
    // tick is a bar boundary of the meter before it. 73 regions, no throw.
    const a = barAtlas(plan.meterEntries, PPQN);
    expect(a).toHaveLength(73);
    // 171 declared downbeats minus the implicit one at tick 0 still
    // beyond the last entry: the final entry's barAtTick counts every
    // completed bar before it.
    expect(a[a.length - 1].barAtTick).toBeGreaterThan(150);
  });

  it("barForTick recovers the file's own beatInBar column, all 454 rows", () => {
    const a = barAtlas(plan.meterEntries, PPQN);
    parsed.forEach((row, i) => {
      const tick = plan.firstBeatTick + i * PPQN;
      const pos = barForTick(a, tick);
      expect(pos.beatInBar, `row ${i} (t=${row.second})`).toBe(row.beatInBar);
      expect(pos.tickInBeat, `row ${i}`).toBe(0); // beats sit ON the tick grid
    });
  });

  it("bar numbers are consecutive across all 171 downbeats", () => {
    const a = barAtlas(plan.meterEntries, PPQN);
    const bars = plan.downbeatIndices.map(
      (i) => barForTick(a, plan.firstBeatTick + i * PPQN).bar
    );
    bars.forEach((b, k) => expect(b, `downbeat ${k}`).toBe(k + 1));
  });

  it("agrees with the production MeterMap at every beat tick and bar start", () => {
    const a = barAtlas(plan.meterEntries, PPQN);
    const map = new MeterMap(PPQN, plan.meterEntries[0].numerator, 4);
    for (const m of plan.meterEntries.slice(1)) {
      map.setMeter(m.numerator, m.denominator, m.tick);
    }
    parsed.forEach((_, i) => {
      const tick = plan.firstBeatTick + i * PPQN;
      expect(barForTick(a, tick).bar, `tick ${tick}`).toBe(map.tickToBar(tick));
      expect(isBarStart(a, tick), `tick ${tick}`).toBe(map.isBarBoundary(tick));
    });
    const lastBar = barForTick(a, plan.firstBeatTick + (parsed.length - 1) * PPQN).bar;
    for (let b = 1; b <= lastBar; b++) {
      expect(tickForBar(a, b), `bar ${b}`).toBe(map.barToTick(b));
    }
  });
});
