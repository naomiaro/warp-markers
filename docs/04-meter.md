# 04 · Meter is not tempo

Tempo is the integral. Meter is *not* — it is arithmetic on the beat axis. A
quarter note at 120 BPM lasts 0.5 s in 3/4, 4/4, or 7/8; meter never changes how
long a beat *takes*. What it decides is how beats *group*:

$$\text{positionInBar} = (\beta_{\text{idx}} - \text{segStart}) \bmod \text{beatsPerBar}$$

$$\text{bar} = \text{barsBefore} + \left\lfloor\frac{\beta_{\text{idx}} - \text{segStart}}{\text{beatsPerBar}}\right\rfloor$$

That is the whole layer — one `%` and one `/` per beat. No integration, no
calculus. The brief loop in `barPositionOf` only exists to carry the running bar
count across meter changes, since each change can start a run of a different
length.

<!--@include: ./.generated/meter-intro.md-->

## The accent click is the meter layer made audible

The most concrete demonstration: a metronome plays a **higher-pitched accent
click on each downbeat** and a **plainer click on the other beats**. The pitch
difference is the meter layer in one tone. The grid chooses which click to play by
asking exactly one question per beat:

```js
clickForBeat(meterMap, i) === "accent" ? accentBuf : normalBuf
```

That single classification IS the entire meter layer at work.

## Two layers, one timeline

<MeterDemo />

Try this:

1. Pick the **4/4 → 3/4 at bar 3** preset. The tempo holds steady; the accent
   pattern changes at beat 8. The accent moves to a new beat without the tempo
   changing.
2. Drag the middle orange dot. The downbeat *seconds* shift in the table below
   while the *bar* and *position* columns sit still. This is the
   tempo↔meter independence the chapter is about — one drag, two layers, only
   one of them touched.

## How beat_this fits

beat_this returns two parallel lists: `beats` and `downbeats`. It never emits a
declared time signature. The meter is recovered from the *spacing* between
downbeats:

```text
gap = downIndex(k+1) - downIndex(k)         // in beats
```

When `gap` changes — say from 4 to 3 — a meter change is recorded. A piece going
4/4 → 3/4 shows up as downbeat gaps switching from 4 to 3 with no separate
"time signature changed" event. `meterMapFromBeats` packages that walk.

"Beats per bar" here means the pulse beat_this tracks; finer distinctions like
simple-vs-compound feel (6/8 felt as two pulses versus six) are a labeling
convention layered on top, not built into the arithmetic.
