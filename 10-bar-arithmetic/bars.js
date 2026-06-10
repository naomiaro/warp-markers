// ============================================================================
// 10 · Bars that change size
// ============================================================================
//
// Chapter 04 taught meter as bar arithmetic — one `%`, one `/` — but it only
// ever saw a single time signature. Chapter 08 met real data and derived
// METER ENTRIES from a file's declared downbeats:
//
//     [{ tick, numerator, denominator }, ...]
//
// each entry starting a run of equal-length bars. The real fixture (Ben
// Folds' "Bastard") has 73 such regions — bars of 1 to 7 beats. This module
// derives the bookkeeping that makes bar numbers survive those changes, and
// the tests prove it equivalent to the production MeterMap from
// @dawcore/transport — the same treatment chapter 08 gave the TempoMap.
//
// Number systems (the repo-wide agreement):
//   - array indices are 0-based
//   - beat numbers are 1-based
//   - bar numbers are 1-based (bar 1 is the first bar — musicians count
//     from one)
//   - β is continuous, tick 0 = beat 1 (chapter 07)
//   - ticks are 0-based integers
//   - beatInBar is 1-based (the downbeat is beat 1)
// Never conflate them. Every `+ 1` below is one of these conventions made
// explicit, and is labelled as such.

// ============================================================================
// The atlas: one cached number per meter entry
// ============================================================================

// <doc id="bar-atlas">
// Within one meter region, the chapter-04 arithmetic still works: every bar
// is the same length in ticks, so "which bar?" is one division and "where in
// the bar?" is one modulo. A region's bar length comes straight from its
// time signature. The denominator names the beat unit (a /4 meter counts in
// quarter notes, a /8 meter in eighths), and ppqn is ticks per QUARTER note,
// so:
//
//     ticksPerBeat_k = ppqn * 4 / denominator_k
//     ticksPerBar_k  = numerator_k * ticksPerBeat_k
//
// What meter CHANGES add is exactly one number per entry: how many bars came
// before it. Walk the entries once, and at each boundary add the number of
// whole bars the previous region contained:
//
//     barAtTick_0     = 0
//     barAtTick_{k+1} = barAtTick_k + (tick_{k+1} - tick_k) / ticksPerBar_k
//
// RULE (bar count): barAtTick_{k+1} = barAtTick_k + (tick_{k+1} - tick_k) / ticksPerBar_k
//
// This running sum is the meter layer's analogue of chapter 01's
// secondsAtTick cache — the same trick on a different axis. The tempo map
// caches SECONDS at each tempo entry so that "what time is tick T?" never
// re-walks every segment; the meter map caches BARS at each meter entry so
// that "which bar is tick T in?" never does either. Both turn "walk all
// segments" into "find the segment, then one division".
//
// The division in the recurrence must come out an integer. If a meter entry
// lands mid-bar of the meter before it, the previous region contains a
// fractional number of bars, and every bar number after that point is
// corrupted. That is exactly the failure the validation in the production
// MeterMap guards, so we throw on it too rather than rounding it away.
// </doc>

// Per-entry bar geometry, derived on demand from the entry and the atlas's
// ppqn. Kept as tiny named functions so the query code reads like the math.
function ticksPerBeatOf(ppqn, denominator) {
  return (ppqn * 4) / denominator;
}
function ticksPerBarOf(ppqn, entry) {
  return entry.numerator * ticksPerBeatOf(ppqn, entry.denominator);
}

// ----------------------------------------------------------------------------
// barAtlas(meterEntries, ppqn)
//
// Input: chapter 08's meter-entry shape, sorted, first entry at tick 0:
//     [{ tick, numerator, denominator }, ...]
// Output: a NEW array (the input is never mutated) of frozen entries:
//     [{ tick, numerator, denominator, barAtTick }, ...]
// The returned array carries `ppqn` as a non-enumerable property so the
// queries below can derive ticksPerBeat / ticksPerBar without re-asking;
// the entries themselves keep exactly the four-field shape above.
//
// Validation, in order:
//   - ppqn is a positive integer
//   - entries form a non-empty array
//   - entries are sorted by strictly increasing tick, first at tick 0
//   - each entry's ticksPerBeat = ppqn * 4 / denominator is an integer
//     (the production MeterMap throws on this too — a fractional tick
//     cannot be addressed)
//   - each entry's tick is on a bar boundary of the PREVIOUS meter, i.e.
//     the division in the recurrence is an integer (see the doc block)
// ----------------------------------------------------------------------------
export function barAtlas(meterEntries, ppqn) {
  if (!Number.isInteger(ppqn) || ppqn <= 0) {
    throw new RangeError(`ppqn must be a positive integer, got ${ppqn}`);
  }
  if (!Array.isArray(meterEntries) || meterEntries.length === 0) {
    throw new RangeError('meterEntries must be a non-empty array');
  }
  if (meterEntries[0].tick !== 0) {
    throw new RangeError(
      `first meter entry must be at tick 0, got ${meterEntries[0].tick}`
    );
  }

  const atlas = [];
  let barAtTick = 0; // barAtTick_0 = 0: no bars before the first entry

  for (let k = 0; k < meterEntries.length; k++) {
    const { tick, numerator, denominator } = meterEntries[k];

    // ticksPerBeat_k = ppqn * 4 / denominator_k must be an integer.
    const tpb = ticksPerBeatOf(ppqn, denominator);
    if (!Number.isInteger(tpb)) {
      throw new RangeError(
        `ticksPerBeat = ${ppqn} * 4 / ${denominator} = ${tpb} is not an ` +
          `integer; this meter cannot be addressed at this ppqn`
      );
    }

    if (k > 0) {
      const prev = atlas[k - 1];
      if (tick <= prev.tick) {
        throw new RangeError(
          `meter entries must be sorted by strictly increasing tick ` +
            `(entry ${k} at tick ${tick} after tick ${prev.tick})`
        );
      }
      // The recurrence's divisor: ticksPerBar of the PREVIOUS meter.
      const prevTicksPerBar = ticksPerBarOf(ppqn, prev);
      const barsInPrevRegion = (tick - prev.tick) / prevTicksPerBar;
      if (!Number.isInteger(barsInPrevRegion)) {
        // A meter change mid-bar corrupts every bar number after it —
        // the exact failure the production MeterMap's validation guards.
        throw new RangeError(
          `meter entry at tick ${tick} is not on a bar boundary of the ` +
            `previous meter (${prev.numerator}/${prev.denominator}, ` +
            `${prevTicksPerBar} ticks per bar)`
        );
      }
      // RULE (bar count), applied:
      barAtTick += barsInPrevRegion;
    }

    atlas.push(Object.freeze({ tick, numerator, denominator, barAtTick }));
  }

  Object.defineProperty(atlas, 'ppqn', { value: ppqn, enumerable: false });
  return Object.freeze(atlas);
}

// ============================================================================
// The queries
// ============================================================================

// Find the governing atlas entry for a tick: the LAST entry with
// entry.tick <= tick. Negative ticks have no bar — throw.
function governingEntryForTick(atlas, tick) {
  if (!Number.isInteger(tick) || tick < 0) {
    throw new RangeError(`tick must be a non-negative integer, got ${tick}`);
  }
  let entry = atlas[0];
  for (let k = 1; k < atlas.length; k++) {
    if (atlas[k].tick <= tick) entry = atlas[k];
    else break;
  }
  return entry;
}

// ----------------------------------------------------------------------------
// barForTick(atlas, tick) -> { bar, beatInBar, tickInBeat }
//
// Find the governing entry, then it's chapter 04 again, shifted by the
// cached count:
//
//     bar        = barAtTick + floor((tick - entry.tick) / ticksPerBar) + 1
//     beatInBar  = floor(((tick - entry.tick) % ticksPerBar) / ticksPerBeat) + 1
//     tickInBeat = (tick - entry.tick) % ticksPerBeat
//
// The two `+ 1`s are the 1-based conventions made explicit — bars and beats
// are counted from one. Chapter 04's barPositionOf makes the identical
// shift for the identical reason; the only genuinely new term in the bar
// line is `barAtTick`.
// ----------------------------------------------------------------------------
export function barForTick(atlas, tick) {
  const entry = governingEntryForTick(atlas, tick);
  const ticksPerBeat = ticksPerBeatOf(atlas.ppqn, entry.denominator);
  const ticksPerBar = entry.numerator * ticksPerBeat;
  const delta = tick - entry.tick;

  const bar = entry.barAtTick + Math.floor(delta / ticksPerBar) + 1; // bars are 1-based
  const beatInBar =
    Math.floor((delta % ticksPerBar) / ticksPerBeat) + 1; // beats are 1-based
  const tickInBeat = delta % ticksPerBeat;

  return { bar, beatInBar, tickInBeat };
}

// ----------------------------------------------------------------------------
// tickForBar(atlas, bar) -> first tick of that bar (1-based bar)
//
// Find the governing entry: the LAST entry with barAtTick < bar. The strict
// `<` matters at exact boundaries — a bar that starts exactly at a meter
// entry belongs to the NEW entry. (That entry's barAtTick equals bar - 1,
// which is still < bar; any later entry has barAtTick >= bar.) Then:
//
//     tick = entry.tick + (bar - 1 - barAtTick) * ticksPerBar
//
// where the `- 1` undoes the 1-based bar convention before multiplying.
// Past the last entry the last meter extrapolates forever — the step
// convention used repo-wide.
// ----------------------------------------------------------------------------
export function tickForBar(atlas, bar) {
  if (!Number.isInteger(bar) || bar < 1) {
    throw new RangeError(`bar must be an integer >= 1, got ${bar}`);
  }
  let entry = atlas[0];
  for (let k = 1; k < atlas.length; k++) {
    if (atlas[k].barAtTick < bar) entry = atlas[k];
    else break;
  }
  return entry.tick + (bar - 1 - entry.barAtTick) * ticksPerBarOf(atlas.ppqn, entry);
}

// ----------------------------------------------------------------------------
// isBarStart(atlas, tick) -> boolean
//
// A tick starts a bar exactly when its offset into the governing region is
// a whole number of bars:
//
//     (tick - entry.tick) % ticksPerBar === 0
// ----------------------------------------------------------------------------
export function isBarStart(atlas, tick) {
  const entry = governingEntryForTick(atlas, tick);
  return (tick - entry.tick) % ticksPerBarOf(atlas.ppqn, entry) === 0;
}
