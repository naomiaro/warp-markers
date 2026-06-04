// ===========================================================================
// beats-io.test.js -- parser + writer worked examples
// ===========================================================================
import { describe, it, expect } from "vitest";
import { parseBeats, exportBeatsTsv } from "./beats-io.js";

describe("parseBeats", () => {
  it("reads the sample 4/4 file with a 2-beat pickup", () => {
    // Mirrors the example.beats sample bundled with chapter 03: two pickup
    // rows (3, 4) followed by 4/4 from the first downbeat at row 3.
    const text = `
0.250  3
0.750  4
1.250  1
1.750  2
2.250  3
2.750  4
3.250  1
`;
    const out = parseBeats(text);
    expect(out.length).toBe(7);
    expect(out[0]).toEqual({ second: 0.25, beatInBar: 3 });
    expect(out[2]).toEqual({ second: 1.25, beatInBar: 1 });
    expect(out[6]).toEqual({ second: 3.25, beatInBar: 1 });
  });

  it("rejects non-monotonic timestamps", () => {
    expect(() => parseBeats("0.5 1\n0.4 2\n")).toThrow(/not strictly increasing/);
  });

  it("rejects empty / non-numeric input", () => {
    expect(() => parseBeats("# only a comment\n")).toThrow(/no beats found/);
    expect(() => parseBeats("oops\n")).toThrow();
  });
});

describe("exportBeatsTsv", () => {
  it("round-trips a steady 4/4 file with pickup", () => {
    // Input: same shape as ch.03's example.beats. Expected behaviour:
    //   parse  -> markers + beatInBar numbers
    //   export -> a TSV that parses back to the same markers + numbers
    const source = [
      "0.250000\t3",
      "0.750000\t4",
      "1.250000\t1",
      "1.750000\t2",
      "2.250000\t3",
      "2.750000\t4",
      "3.250000\t1",
      "",
    ].join("\n");
    const parsed = parseBeats(source);

    // Build markers (just need .second) and the downbeat index list
    // (indices of rows where beatInBar === 1).
    const markers = parsed.map((p) => ({ second: p.second }));
    const downbeatIndices = parsed
      .map((p, i) => (p.beatInBar === 1 ? i : -1))
      .filter((i) => i >= 0);

    const text2 = exportBeatsTsv(markers, downbeatIndices);
    const parsed2 = parseBeats(text2);

    expect(parsed2.length).toBe(parsed.length);
    for (let i = 0; i < parsed.length; i++) {
      // seconds round-trip to numeric tolerance, beat numbers round-trip
      // identically (integer)
      expect(Math.abs(parsed2[i].second - parsed[i].second)).toBeLessThan(1e-6);
      expect(parsed2[i].beatInBar).toBe(parsed[i].beatInBar);
    }
  });

  it("numbers a no-pickup file as 1,2,3,4 from row 0", () => {
    // Starts ON the downbeat: no pickup. Numbering is just 1..barLen
    // repeating.
    const markers = [
      { second: 0.0 }, { second: 0.5 }, { second: 1.0 }, { second: 1.5 },
      { second: 2.0 }, { second: 2.5 }, { second: 3.0 }, { second: 3.5 },
    ];
    const downs = [0, 4];
    const text = exportBeatsTsv(markers, downs);
    const parsed = parseBeats(text);
    expect(parsed.map((p) => p.beatInBar)).toEqual([1, 2, 3, 4, 1, 2, 3, 4]);
  });
});
