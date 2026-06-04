# 03 · Real audio

The production path: take a `.beats` file from
[beat_this](https://github.com/CPJKU/beat_this), build a tempo model with the
chapter 01 code, and play it back with the playhead following the warp map.

This is also where the **real-world wrinkle** lives that the teaching layer skips:
real beat maps do not start at beat 0 / second 0, so a small bridge is needed
between the file's timestamps and the math layer's coordinate system.

## Two coordinate decisions, kept separate

The chapter splits the bridge into two distinct concerns:

### 1. Time shift (forced by the math API)

`piecewiseConstantMap` requires the marker model to start at $\{\beta: 0,\, t: 0\}$.
Real `.beats` files almost never start exactly at 0 s, so we subtract `beats[0].second`
from every entry before building the model. The audio file's time axis is unchanged
— we just remember the offset and apply it whenever we round-trip between
**audio-clock seconds** and **model seconds**.

```text
modelSec = audioSec - audioOffsetSec
audioSec = modelSec + audioOffsetSec
```

### 2. Pickup-beat offset (a musical decision)

In 4/4, a "bar" starts on a downbeat (`beatInBar === 1`). If the file begins
mid-bar — say, with `beatInBar` values 3, 4, 1, 2, … — the first two rows are a
**pickup**, the tail of a bar that began before the recording.

```text
pickupBeats     = index of the first row tagged as a downbeat
barBoundaries   = { pickupBeats, pickupBeats + 4, pickupBeats + 8, … }
```

The math layer doesn't know or care about bars; this metadata is purely so a UI
can paint a thicker line at every downbeat. Mixing it into the tempo computation
would conflate two different things — see chapter 04.

## Playback is plain Web Audio

The audio engine uses an `AudioContext`, a `BufferSource` for the audio (when an
audio file is loaded) or scheduled click `BufferSource`s at each beat (when only a
`.beats` file is provided), and a `requestAnimationFrame` loop that reads
`audioContext.currentTime`. The playhead's musical position $\beta$ is just
`map.secondsToBeats(audioSec)` evaluated each frame.

No external transport library, no framework — the calculus story passes straight
through plain Web Audio APIs.

## Round-trip verification

For each parsed beat the page renders a debug table:

| parsed $t$ | $\beta = s \to b(t)$ | $t' = b \to s(\beta)$ | residual |
| --- | --- | --- | --- |

The residual column is the proof that the model reproduces the data it was built
from. For a piecewise-constant model built from beat_this output, every residual
is zero to numerical noise — the model has nothing to lose between input and output
because the integral is exact on each step.

## Try it locally

```bash
cd 03-real-audio
npm run dev
```

The standalone demo expects you to drop in your own audio + `.beats` files (or use
the bundled synthetic sample to verify the grid without audio).
