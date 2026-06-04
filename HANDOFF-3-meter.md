# Handoff brief 3 — the meter layer (chapter 04), run AFTER HANDOFF-2-curves.md

Do not start until `HANDOFF-2-curves.md` is finished and committed: `curvedMap`
exists in `01-the-math` with passing tests, and `02-visualise` has its fourth mode.
This brief adds a NEW chapter, `04-meter/`, and updates the README to introduce it.

## The point of this chapter: meter is NOT tempo

Everything so far lives in one layer — the beats→seconds map
`t(β) = ∫₀^β 60/BPM(b) db`. That layer is where the calculus is, because tempo varies
continuously and you have to integrate a rate.

Meter is a **different layer that shares the same timeline**, and it deliberately needs
*no* calculus. A time signature does not change how long a beat takes — a quarter note
at 120 BPM is 0.5 s in 3/4, 4/4, or 7/8. What meter decides is purely how beats
**group into bars**: which beat is a downbeat (bar position 0) and which are interior
beats. That is integer division and modulo — arithmetic, not integration.

This chapter exists to make that contrast obvious by putting the two layers
side by side. The phrase to keep in mind: **tempo decides WHEN a beat happens (seconds);
meter decides WHAT a beat is called (bar, position-in-bar).**

### How this becomes audible — the accented click

The most concrete demonstration: a metronome plays a **higher-pitched accent click on
each downbeat** and a **plainer, lower click on the other beats** in the bar. That pitch
difference is the meter layer made audible. The two-tone scheme from Naomi Aro's
`beat-map-grid.html` is the reference:

```js
// downbeat: brighter, louder.   other beats: duller, quieter.
const accent = createClickBuffer(1200, 0.05, 0.8 * vol);
const normal = createClickBuffer(800, 0.04, 0.5 * vol);
```

The grid chooses which click to play for a given beat by asking ONE question:
"is this beat's position within its bar equal to 0?" That single classification per beat
IS the entire meter layer at work. Everything else in this chapter is presentation
around that one decision.

### How beat_this fits

beat_this returns two parallel lists — `beats` and `downbeats` — written to a `.beats`
TSV by `save_beat_tsv`. It does NOT emit a time-signature string. So meter is not given
to you; you read it off the data: a beat is a downbeat if its timestamp appears in the
downbeats list, and the meter (beats per bar) is just the count of beats from one
downbeat up to (not including) the next. That count can change mid-piece — a 4/4 section
followed by 3/4 shows up as downbeat gaps going from 4 beats to 3. There is no separate
"time signature changed" event; it is implicit in the downbeat spacing.

### How warp markers interact with the meter layer

This is the interaction to demonstrate, because it nails the independence:

- Dragging a warp marker changes **when** a downbeat sounds (its time in seconds) — the
  tempo/integral layer.
- It never changes **which** beat is the downbeat — that is fixed by the meter layer.

So a warp edit slides the accent click earlier or later in time, but the *pattern* of
accents (every 4th beat, or every 3rd) is untouched. Two independent edits on one grid.

## Build the chapter

### Task 1 — `04-meter/meter.js`, pure arithmetic

Create the chapter folder with `"name": "@warp-math/meter"` in its `package.json`
(workspace member; add it to the root `package.json` workspaces array). Write
`meter.js` exporting the functions below. **Use this reference implementation as the
foundation** — it is the arithmetic counterpart to the tempo integral and should not be
"improved" into something cleverer; clarity is the product here.

```js
// ===========================================================================
// meter.js — the meter layer. No calculus. Integer division and modulo only.
//
// Tempo (chapters 01–02) answers "what SECOND is beat β?" via an integral.
// Meter answers "what BAR and position-in-bar is beat index n?" via division.
// They share a timeline but are computed completely independently.
//
// A meterMap is a list of changes, each saying "from this beat index onward,
// there are this many beats per bar":
//   [{ fromBeat: 0, beatsPerBar: 4 }, { fromBeat: 32, beatsPerBar: 3 }]
// fromBeat values must be downbeats (a meter change can only begin on a bar).
// ===========================================================================

// Which meter segment governs a given (zero-based) beat index.
function segmentFor(meterMap, beatIndex) {
  let seg = meterMap[0];
  for (const m of meterMap) {
    if (m.fromBeat <= beatIndex) seg = m; else break;
  }
  return seg;
}

// Map a beat index to { bar, positionInBar, isDownbeat }.
// bar and positionInBar are zero-based. positionInBar === 0 is the downbeat.
//
// Within a single constant-meter run this is literally:
//   positionInBar = (beatIndex - segmentStart) % beatsPerBar
//   bar           = barsBefore + floor((beatIndex - segmentStart) / beatsPerBar)
// i.e. one modulo and one division. The loop below only exists to carry the
// running bar count across meter changes, since each change can start a run of
// a different length.
export function barPositionOf(meterMap, beatIndex) {
  if (beatIndex < 0) throw new Error("beatIndex must be >= 0");
  let barsBefore = 0;
  for (let i = 0; i < meterMap.length; i++) {
    const seg = meterMap[i];
    const next = meterMap[i + 1];
    const segStart = seg.fromBeat;
    const segEnd = next ? next.fromBeat : Infinity; // exclusive
    if (beatIndex < segEnd) {
      const offset = beatIndex - segStart;
      const positionInBar = offset % seg.beatsPerBar;
      const bar = barsBefore + Math.floor(offset / seg.beatsPerBar);
      return { bar, positionInBar, isDownbeat: positionInBar === 0 };
    }
    // whole segment consumed: add the bars it contained before moving on
    const span = segEnd - segStart;
    barsBefore += Math.ceil(span / seg.beatsPerBar);
  }
  throw new Error("unreachable");
}

// Pick which click a beat should play. The whole meter layer in one call.
export function clickForBeat(meterMap, beatIndex) {
  return barPositionOf(meterMap, beatIndex).isDownbeat ? "accent" : "normal";
}

// Recover a meterMap from beat_this output: derive the meter from where the
// downbeats fall, rather than from any declared time signature.
//   beats:     array of all beat timestamps (seconds), ascending
//   downbeats: array of downbeat timestamps (a subset of beats)
// A meter change is recorded whenever the gap (in beats) between consecutive
// downbeats differs from the previous gap.
export function meterMapFromBeats(beats, downbeats) {
  const isDown = new Set(downbeats.map((t) => +t.toFixed(6)));
  const downIndices = [];
  beats.forEach((t, i) => { if (isDown.has(+t.toFixed(6))) downIndices.push(i); });
  if (downIndices.length < 2) return [{ fromBeat: 0, beatsPerBar: 4 }]; // fallback
  const map = [];
  let prevGap = null;
  for (let k = 0; k < downIndices.length - 1; k++) {
    const gap = downIndices[k + 1] - downIndices[k];
    if (gap !== prevGap) {
      map.push({ fromBeat: downIndices[k], beatsPerBar: gap });
      prevGap = gap;
    }
  }
  if (map.length === 0 || map[0].fromBeat !== 0) {
    map.unshift({ fromBeat: 0, beatsPerBar: map[0]?.beatsPerBar ?? 4 });
  }
  return map;
}
```

### Task 2 — `04-meter/meter.test.js`

Match the worked-example style of `01-the-math/tempo-map.test.js` (state the property in
words, then check it). Cover at least:

1. In steady 4/4, beat indices 0,4,8 are downbeats and 1,2,3,5 are not.
2. `positionInBar` cycles 0,1,2,3,0,1,2,3 across the first eight beats of 4/4.
3. A meter change `[{fromBeat:0,beatsPerBar:4},{fromBeat:8,beatsPerBar:3}]` makes
   beat 8 a downbeat, beat 11 a downbeat, and beat 10 not — and the bar count is
   continuous across the change (bars before the change + bars after line up, no gap or
   overlap).
4. `clickForBeat` returns "accent" exactly on downbeats.
5. `meterMapFromBeats` recovers `4` then `3` from a synthetic beats/downbeats pair where
   the downbeat spacing changes from 4 to 3. Build the synthetic input in the test; no
   audio needed.

Commit: `feat(meter): bar-position arithmetic with meter-change support`.

### Task 3 — `04-meter/` interactive demo

A small page (same toolchain as `02-visualise`) that makes the two layers visible and
audible together:

- Render a beat grid. Mark downbeats distinctly from interior beats (e.g. taller / bolder
  tick) using `barPositionOf().isDownbeat` — NOT a hardcoded "every 4th".
- A metronome using the two-tone accent/normal scheme above, choosing the click per beat
  via `clickForBeat`. The accent on downbeats is the audible payoff.
- A control to switch the meter, and a **preset that changes meter mid-sequence (4/4 →
  3/4)** so the user hears the accent move onto a different beat while the **tempo holds
  steady**. Drive the timing of the beats from chapter 01's `beatsToSeconds` (constant
  tempo is fine) so it is visibly the same time map underneath — only the accent pattern
  changes.
- Include at least one draggable warp marker (reuse the `pin()` interaction from
  `02-visualise`) and show, in text or visually, that dragging it moves the downbeat in
  *seconds* but the accent pattern (which beats are downbeats) does not change. This is
  the "warp markers vs meter layer" demonstration; make it explicit.

Import meter functions from `@warp-math/meter` and tempo functions from
`@warp-math/the-math`. Do not reimplement either layer in the demo.

Commit: `feat(meter): interactive demo with mid-sequence meter change`.

## Task 4 — README update

Add a `### 04-meter` entry under the layout section, and a short prose block titled
"Meter is not tempo" that states: tempo is the integral (when, in seconds); meter is
integer division and modulo (what a beat is called); they are independent layers on one
timeline; beat_this gives downbeats so meter is read from downbeat spacing, not declared;
and a warp edit moves a downbeat in time without changing which beat is the downbeat. Also
add an `04-meter/` row to the layout tree. Keep the existing tempo/curve prose intact.

## Out of scope

- Compound vs simple meter subtleties (6/8 felt as 2 vs as 6). You may add ONE sentence
  in the README noting that "beats per bar" here means the pulse beat_this tracks, and
  that the simple/compound distinction is a labeling convention on top, but do not build
  logic for it.
- Rendering a full notation-style time signature glyph. A numeric "4/4" label is enough.

## Working agreement (unchanged)

- All chapters' tests green at every commit.
- Small, labelled commits per task.
- Do not alter derivation comments in `01-the-math`.
- Ask before adding heavy dependencies (none should be needed — meter is arithmetic).
