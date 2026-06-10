// ============================================================================
// 10 · Bars that change size — test catalogue
// ============================================================================
//
// Worked-example style: each it() states the property in prose, then asserts
// exact numbers. The fixture is a miniature of the real Bastard file's shape
// (chapter 08): four meter regions, bars of different sizes.
//
// The headline test is §5: every query, swept across the whole fixture,
// agrees exactly with the production MeterMap from @dawcore/transport —
// the same equivalence treatment chapter 08 gave the TempoMap.

import { describe, it, expect } from 'vitest';
import { MeterMap } from '@dawcore/transport';
import { barAtlas, barForTick, tickForBar, isBarStart } from './bars.js';

const PPQN = 960;

// 2 bars of 4/4, 2 bars of 3/4, 1 bar of 7/4, then 2/4 to the end.
const FIXTURE = [
  { tick: 0, numerator: 4, denominator: 4 },
  { tick: 7680, numerator: 3, denominator: 4 },
  { tick: 13440, numerator: 7, denominator: 4 },
  { tick: 20160, numerator: 2, denominator: 4 },
];

// Derived by hand in the chapter: ticksPerBar = 3840, 2880, 6720, 1920.
// Bar starts (1-based bars; bar 8 is in the extrapolated 2/4 region):
const BAR_STARTS = [0, 3840, 7680, 10560, 13440, 20160, 22080, 24000];

const atlas = () => barAtlas(FIXTURE, PPQN);

// ============================================================================
// 1. The atlas
// ============================================================================
describe('barAtlas', () => {
  it('caches exactly one number per entry: bars before it = [0, 2, 4, 5]', () => {
    const a = atlas();
    expect(a.map((e) => e.barAtTick)).toEqual([0, 2, 4, 5]);
    // The entries keep chapter 08's fields alongside the cache.
    expect(a[2]).toEqual({
      tick: 13440,
      numerator: 7,
      denominator: 4,
      barAtTick: 4,
    });
  });

  it('never mutates its input', () => {
    const input = FIXTURE.map((e) => ({ ...e }));
    const copy = input.map((e) => ({ ...e }));
    barAtlas(input, PPQN);
    expect(input).toEqual(copy);
  });
});

// ============================================================================
// 2. Spot queries (worked by hand in the chapter)
// ============================================================================
describe('barForTick — spot queries', () => {
  it('tick 9600 = 7680 + 2·960: bar 3, beat 3 of the 3/4, on the beat', () => {
    expect(barForTick(atlas(), 9600)).toEqual({
      bar: 3,
      beatInBar: 3,
      tickInBeat: 0,
    });
  });

  it('tick 16320 = 13440 + 3·960: bar 5 (the 7/4 bar), beat 4', () => {
    expect(barForTick(atlas(), 16320)).toEqual({
      bar: 5,
      beatInBar: 4,
      tickInBeat: 0,
    });
  });

  it('tick 13439, the last tick before the 7/4 bar: bar 4, beat 3, tickInBeat 959', () => {
    expect(barForTick(atlas(), 13439)).toEqual({
      bar: 4,
      beatInBar: 3,
      tickInBeat: 959,
    });
  });
});

// ============================================================================
// 3. Round trip: barForTick and tickForBar are exact inverses on bar starts
// ============================================================================
describe('round trip', () => {
  it('barForTick(tickForBar(b)) returns bar b at beat 1, for bars 1..10 (through the extrapolated region)', () => {
    const a = atlas();
    for (let b = 1; b <= 10; b++) {
      const pos = barForTick(a, tickForBar(a, b));
      expect(pos.bar).toBe(b);
      expect(pos.beatInBar).toBe(1);
    }
  });
});

// ============================================================================
// 4. isBarStart
// ============================================================================
describe('isBarStart', () => {
  it('is true at all eight listed bar starts and false one tick either side', () => {
    const a = atlas();
    for (const t of BAR_STARTS) {
      expect(isBarStart(a, t)).toBe(true);
      expect(isBarStart(a, t + 1)).toBe(false);
      if (t > 0) expect(isBarStart(a, t - 1)).toBe(false);
    }
  });
});

// ============================================================================
// 5. Equivalence with the production MeterMap (the chapter's point)
// ============================================================================
describe('equivalence with @dawcore/transport MeterMap', () => {
  // Build the production map from the SAME entries.
  function productionMap() {
    const map = new MeterMap(PPQN, FIXTURE[0].numerator, FIXTURE[0].denominator);
    for (const { tick, numerator, denominator } of FIXTURE.slice(1)) {
      map.setMeter(numerator, denominator, tick);
    }
    return map;
  }

  // Sweep: every 480 ticks across the fixture and into the extrapolated
  // region, plus every listed bar start and its ±1 neighbours.
  function sweepTicks() {
    const ticks = new Set();
    for (let t = 0; t <= 26880; t += 480) ticks.add(t);
    for (const t of BAR_STARTS) {
      ticks.add(t);
      ticks.add(t + 1);
      if (t > 0) ticks.add(t - 1);
    }
    return [...ticks].sort((x, y) => x - y);
  }

  it('tickToBar agrees with barForTick(...).bar at every sweep tick', () => {
    const a = atlas();
    const map = productionMap();
    for (const t of sweepTicks()) {
      expect(barForTick(a, t).bar, `tick ${t}`).toBe(map.tickToBar(t));
    }
  });

  it('isBarBoundary agrees with isBarStart at every sweep tick', () => {
    const a = atlas();
    const map = productionMap();
    for (const t of sweepTicks()) {
      expect(isBarStart(a, t), `tick ${t}`).toBe(map.isBarBoundary(t));
    }
  });

  it('barToTick agrees with tickForBar for bars 1..10', () => {
    const a = atlas();
    const map = productionMap();
    for (let b = 1; b <= 10; b++) {
      expect(tickForBar(a, b), `bar ${b}`).toBe(map.barToTick(b));
    }
  });
});

// ============================================================================
// 6. Validation
// ============================================================================
describe('validation', () => {
  it('throws when the first entry is not at tick 0', () => {
    expect(() =>
      barAtlas([{ tick: 960, numerator: 4, denominator: 4 }], PPQN)
    ).toThrow(/tick 0/);
  });

  it('throws on unsorted entries', () => {
    expect(() =>
      barAtlas(
        [
          { tick: 0, numerator: 4, denominator: 4 },
          { tick: 7680, numerator: 3, denominator: 4 },
          { tick: 3840, numerator: 2, denominator: 4 },
        ],
        PPQN
      )
    ).toThrow(/sorted/);
  });

  it('throws on a mid-bar meter change (tick 2000 is not a multiple of 3840)', () => {
    expect(() =>
      barAtlas(
        [
          { tick: 0, numerator: 4, denominator: 4 },
          { tick: 2000, numerator: 3, denominator: 4 },
        ],
        PPQN
      )
    ).toThrow(/bar boundary/);
  });

  it('throws on fractional ticksPerBeat (ppqn 6 with denominator 16 gives 1.5)', () => {
    expect(() =>
      barAtlas([{ tick: 0, numerator: 4, denominator: 16 }], 6)
    ).toThrow(/integer/);
  });

  it('throws on bar 0 and on negative-tick queries', () => {
    const a = atlas();
    expect(() => tickForBar(a, 0)).toThrow(RangeError);
    expect(() => barForTick(a, -1)).toThrow(RangeError);
    expect(() => isBarStart(a, -1)).toThrow(RangeError);
  });
});

// ============================================================================
// 7. A 6/8 sanity row: the denominator really does change the beat unit
// ============================================================================
describe('6/8 at ppqn 960', () => {
  const SIX_EIGHT = [{ tick: 0, numerator: 6, denominator: 8 }];

  it('ticksPerBeat 480, ticksPerBar 2880: bar 2 starts at tick 2880', () => {
    const a = barAtlas(SIX_EIGHT, PPQN);
    expect(tickForBar(a, 2)).toBe(2880);
    expect(isBarStart(a, 2880)).toBe(true);
  });

  it('tick 2400 is bar 1, beatInBar 6 (the sixth eighth note)', () => {
    const a = barAtlas(SIX_EIGHT, PPQN);
    expect(barForTick(a, 2400)).toEqual({
      bar: 1,
      beatInBar: 6,
      tickInBeat: 0,
    });
  });
});
