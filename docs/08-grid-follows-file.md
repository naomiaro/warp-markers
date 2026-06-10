# 08 · The grid follows the file

Chapter 07 warped the file onto a rigid grid, and that direction has a price: varispeed shifts the pitch, and avoiding the shift means time-stretch DSP. This chapter pays nothing. Run the conform **the other way** — make the *project's tempo map* be the file's beat map — and the audio plays raw at rate 1.0, bit-identical, while the metronome, the bar ruler, and every MIDI clip follow the file's wobble instead. This is the other half of every DAW's warp workflow: Ableton's *Set tempo from clip*, Logic's *adapt project tempo to recording*.

It is also this tutorial's first **advanced chapter**: playback runs through [`@dawcore/transport`](https://www.npmjs.com/package/@dawcore/transport), a production Web Audio transport whose `TempoMap` implements precisely the regimes chapter 01 derived — `'step'` is the piecewise-constant rectangle sum, `'linear'` is the $(60/s)\ln(\cdot)$ closed form, `'curve'` integrates with the trapezoidal rule. The chapters stop deriving and start *proving*: the tests check that chapter-01 math and the production `TempoMap` agree at every beat, to $10^{-9}$.

<!--@include: ./.generated/grid-follows-file.md-->

## What the conversion actually is

Nothing new. One tempo event per file segment:

| layer | supplies | from chapter |
| --- | --- | --- |
| event `tick` | $(\text{beat} - 1) \cdot \text{PPQN}$ — tick 0 anchors at beat 1 | 07 |
| event `bpm` | `segmentBpm(m[n], m[n+1])` — the instantaneous per-gap BPM | 01 / 05 |
| event semantics | `'step'` interpolation — hold until the next event | 01 (regime 2) |

`tempoEventsFromMarkers(markers, ppqn)` is that conversion in its purest form — events anchored at tick 0 = beat 1, plus `clipOffsetSec = markers[0].second` to trim so the audio's beat-1 sample plays at transport second 0. `gridPlanFromBeats(parsedBeats, ppqn)` is the production-shaped version on top of it: it reads the `.beats` file's `beatInBar` column, detects pickups, and bar-aligns everything (next section).

## The equivalence, proven three ways

The test suite sweeps every quarter-beat of a wobbly fixture through three independent clocks and demands agreement to $10^{-9}$:

1. **Chapter 01** — `piecewiseConstantMap(markers).beatsToSeconds(β)`
2. **Production** — `new TempoMap(ppqn)` fed our events, `ticksToSeconds((β−1)·ppqn) + clipOffset`
3. **Reference** — this chapter's `gridSecondForBeat`, ten lines of pure arithmetic

The same residual check runs **live** in the demo's table: `transport.tickToTime(tick) + clipOffset − beatTime`, evaluated against the actual transport instance that is playing, shows `0.00e+0` down the column while conformed.

## Full bars, pickups, and the lead-in

The recurring number-system lesson closes the loop here, under one non-negotiable constraint: **a DAW's grid is always full bars** — the first downbeat must land on a bar boundary. With $p$ pickup beats:

$$
\text{firstDownbeatTick} = \left\lceil \frac{p \cdot \text{PPQN}}{\text{ticksPerBar}} \right\rceil \cdot \text{ticksPerBar},
\qquad
\text{firstBeatTick} = \text{firstDownbeatTick} - p \cdot \text{PPQN}
$$

so the pickup fills the *end* of the bar before the first downbeat, the empty lead-in bars tick at the first segment's tempo, and the clip is placed so the audio's beat-1 sample sounds exactly at `firstBeatTick`'s second — meaning the file's own lead-in audio **plays** during the count-in bars instead of being trimmed. With no pickup this degenerates to the plain clip offset (trim $t_{\text{first}}$, beat 1 at tick 0). `gridPlanFromBeats` implements all of it, and the test suite checks the conformity rule in both shapes through the production `TempoMap`.

## See and hear it

<p><a href="/warp-markers/demos/08-grid-follows-file/" target="_blank" rel="noopener">Open the standalone demo ↗</a> — the UI is the production stack end to end: <code>&lt;daw-editor&gt;</code> from <code>@dawcore/components</code> draws the bar ruler, grid, waveform, and playhead, with <code>@dawcore/transport</code> underneath. Load a <code>.beats</code> file (bundled: a wobbly no-pickup sample and a steady 2-beat-pickup sample) and optionally its audio. The file is scheduled once and never touched; the <em>conform</em> toggle only swaps the tempo map. Rigid: the bar lines march evenly and the waveform's beats drift across them while the metronome fights the music. Conformed: the grid bends to the waveform and every beat sits on a bar line. The signal is identical both ways — compare with <a href="/warp-markers/demos/07-ppqn-grid/" target="_blank" rel="noopener">chapter 07's demo</a>, where locking the beats changed the sound. The full-editor version of this workflow lives in waveform-playlist's <code>beat-map-grid</code> example.</p>

## What this chapter does not cover

Meter *changes*. The grid here is fixed 4/4; mapping a file whose bar length changes mid-way onto the transport's `MeterMap` (via `meterMapFromBeats` from the shared parser, or `detectMeterChanges` from `@waveform-playlist/core`) is the same plug-two-layers-together move and makes a good exercise. And as ever: no DSP — this chapter's entire point is that none was needed.
