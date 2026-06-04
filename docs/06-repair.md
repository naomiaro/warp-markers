# 06 · Fixing a beat map by hand

Chapter 05 *detected* problems and stopped there — detection is the math
layer's responsibility, fixing is a judgement call that belongs above it. This
chapter is the other half: the user repairs a mostly-correct map by hand.

It is also where the two layers built separately finally operate together.
Chapter 02's `pin()` lives in tempo space — pairs of $(\beta, t)$ and the warp
map between them. Chapter 04's `barPositionOf` lives in meter space — bar
index, position-in-bar, count of beats per bar. **An accidental extra beat in
a 4/4 bar is invisible in pure tempo terms** — nothing about the tempo curve
says "this bar has 5 beats." Only the meter overlay flags it. Every repair
operation in this chapter speaks to both layers: it rebuilds the tempo markers
*and* re-derives which absolute beat indices are downbeats, because deleting
or inserting shifts those indices.

<!--@include: ./.generated/repair-intro.md-->

## Three error types, three operations

Real beat-tracker output makes three kinds of mistake, each with its own
repair:

| Error                    | What the bar looks like   | Repair         |
| ------------------------ | ------------------------- | -------------- |
| **Extra / doubled beat** | bar has too many beats    | `deleteBeat`   |
| **Dropped / missing**    | bar has too few beats     | `insertBeat`   |
| **Mistimed beat**        | right count, wrong time   | `moveBeat`     |

`moveBeat` is exactly chapter 02's `pin()` interaction — drag a marker to
re-pin a beat at a new audio second, with the same monotonicity guard.
`deleteBeat` and `insertBeat` are new, and both have to recompute the absolute
indices of downbeats afterwards — a deleted beat shifts every downstream
downbeat one index earlier, and an inserted beat shifts them one later. This
is the subtle bug a naive implementation misses: the data is correct in time
but wrong about which beat is the downbeat.

## Live validation as the editing feedback loop

The editor shades every bar by the result of
`validateAgainstMeter(markers, downbeatIndices, expectedBeatsPerBar)`. Bars
whose beat count matches the target glow green; bars with the wrong count
turn red and show the actual count next to the expected. The user knows
they've made a successful edit because a bar visibly flips colour. When every
real bar is correct (the pickup and trailing partial bar get a free pass —
they're defined to be short), an **all bars correct ✓** badge appears in the
summary.

## Try the demo

<RepairDemo />

<p><a href="/warp-markers/demos/06-repair/" target="_blank" rel="noopener">Open the full-screen standalone demo ↗</a> — adds <code>.beats</code> upload and download (your file stays in your browser).</p>

The default state is a 4/4 fixture with three deliberate errors so all three
repair operations are exercisable in 30 seconds:

- Bar 2 has an **extra beat** (5 beats — expected 4) → select it and press
  <kbd>delete</kbd>.
- Bar 3 has a **missing beat** (3 beats — expected 4) → click the empty
  space in the gap to insert.
- The last beat of bar 4 is **mistimed** (about 40 ms early) → drag it.

When all three are fixed, the editor lights up green and the badge appears.

## Upload → fix → download

The standalone demo also accepts a `.beats` file via the file input. **Your
file stays in your browser** — parsing is fully client-side, no network. After
you've hand-corrected the map, the "download corrected .beats" button writes
out the same TSV format `beat_this` produces, so the result is a drop-in
replacement for the file you uploaded. Round-trip:

```
parse → hand-edit → exportBeatsTsv → drop into your project
```

The `.beats` parser and writer both live in `@warp-math/beats-io` — one
workspace shared between chapter 03 (which reads the format to drive Web Audio
playback) and chapter 06 (which both reads and writes). The format definition
exists in exactly one place so the two chapters can't drift apart on it.

## What this chapter is NOT

- **No auto-repair.** The validator *shows* what's wrong; it never changes the
  data on its own. An auto-corrector would undercut both this chapter and
  chapter 05's framing, which is that fixing is a judgement call the human
  needs to make.
- **No audio editing.** Hand-edits move the *markers*, not the underlying
  audio. If you load an audio clip for playback, the grid moves over unchanged
  samples — same as in chapter 04.
- **`.beats` only.** No MIDI, no Ableton ASD, no exotic formats. The whole
  point is to round-trip with `beat_this` output cleanly.

## Try it locally

```bash
cd 06-repair
npm run dev
```
