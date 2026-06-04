# 03 · Real audio

The production path: take a `.beats` file from
[beat_this](https://github.com/CPJKU/beat_this), build a tempo model with the
chapter 01 code, and play it back with the playhead following the warp map.

Real beat maps **never have a beat 0** — `beat_this`'s first row is always at some
$t > 0$, tagged with `beatInBar` 1–4. The math layer accommodates this directly:
the first marker in the model is `{beat: 1, second: t_first}`, the integration
anchor $(\beta = 0,\, t = 0)$ sits before any marker, and the implicit lead-in
segment from the anchor to the first marker carries whatever slope the data
implies. No time-shift, no `audioOffsetSec`.

## Pickup-beat offset (a musical decision)

In 4/4, a "bar" starts on a downbeat (`beatInBar === 1`). If the file begins
mid-bar — say, with `beatInBar` values 3, 4, 1, 2, … — the first two rows are a
**pickup**, the tail of a bar that began before the recording.

```text
pickupBeats        = number of rows before the first downbeat
firstDownbeatBeat  = pickupBeats + 1                       (1-indexed)
barBoundaries      = { firstDownbeatBeat, +4, +8, … }      (1-indexed .beat values)
```

The math layer doesn't know or care about bars; this metadata is purely so a UI
can paint a thicker line at every downbeat. Mixing it into the tempo computation
would conflate two different things — see chapter 04.

## Beat numbering

The model's `.beat` field is **1-indexed**: the first beat in the file is beat 1,
the second is beat 2, and so on. This matches `beat_this`'s convention (no row at
beat 0) and the way musicians count. The integration variable $\beta$ stays a
continuous coordinate with $\beta = 0$ as the integration anchor; beats live at
$\beta = 1, 2, 3, \ldots$.

Array indices, by JavaScript convention, are still 0-based: `markers[0]` is the
first marker, `markers[0].beat === 1`. The two number systems exist side by side
— array indices for data access, `.beat` numbers for display and the math.

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

## Try the demo

<p><a href="/warp-markers/demos/03-real-audio/" target="_blank" rel="noopener">Open the standalone demo ↗</a> — runs in your browser, no checkout needed. Click the "use the bundled sample" button to load the synthetic 14-beat fixture, or drop in your own audio and <code>.beats</code> files.</p>

Or run locally to fork and modify:

```bash
cd 03-real-audio
npm run dev
```
