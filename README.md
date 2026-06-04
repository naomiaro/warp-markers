# warp-math

An educational repo for the mathematics behind tempo maps and warp markers — the
machinery a DAW uses to pin a moment in an audio file to a beat on a musical grid,
and to stretch time between those pins.

It is built to be read in order. Each folder raises the fidelity by one step:
pure math you can unit-test, then an interactive visualisation, then the same math
driving real audio playback from a [beat_this](https://github.com/CPJKU/beat_this)
beat map.

## The one idea

Tempo is a *rate*. "120 BPM" means beats arrive at 120 per minute — 2 per second.
If musical position is β (beats) and audio position is t (seconds), tempo is the
derivative of one with respect to the other:

```
dβ/dt = BPM / 60        (beats per second)
```

We almost always want the other direction — "given a beat, what second is it?" —
so we flip the fraction (seconds per beat) and integrate. Integrating a rate
recovers the total:

```
t(β) = ∫₀^β  60 / BPM(b)  db
```

That integral is the whole subject. A **warp map** is this function from beats to
seconds; a **warp marker** is a single `{beat, second}` point that pins the two
together. Everything else — snapping, playback, stretching, drift — falls out of
evaluating or inverting this integral for different shapes of `BPM(b)`.

## Three shapes of BPM(b)

| Shape of tempo | The integral becomes | The warp map looks like |
| --- | --- | --- |
| **Constant** `BPM = K` | `t = (60/K)·β` (constant rule) | a straight line |
| **Piecewise-constant** (what beat_this gives) | a running sum of rectangles | piecewise-linear, kinking at each marker |
| **Linear ramp** (accelerando) | `t = (60/s)·ln(BPM(β)/b₀)` (closed form) | a curve — a logarithm |
| **Curved** (ease in/out, `BPM = b₀ + Δ·(β/L)^k`) | **no closed form** — integrate numerically | a curve with no simple equation |

Read the table top to bottom as a story about the integral, not four separate
tricks. The tempo's *shape* decides how hard the integral is:

- **Constant** is one division.
- **Piecewise-constant** is an exact sum of rectangles, because the function really
  is flat on each piece.
- **Linear ramp** is the surprise: a *linear* change in tempo produces a
  *logarithmic* time map. The curve bends, and if you naively interpolate beat
  positions in a straight line you will drift against the audio. The code derives why.
- **Curved** is where the antiderivative runs out. For a general easing exponent `k`
  the integrand `60 / (b₀ + Δ·(b/L)^k)` has no elementary closed form, so you stop
  solving by hand and **evaluate the integral numerically** (summing thin slices —
  the trapezoidal rule). `k = 1` recovers the linear ramp exactly; `k > 1` eases in,
  `k < 1` eases out.

That last row is the reason every real DAW integrates tempo numerically rather than
reaching for a formula: once tempo automation can be an arbitrary curve, a formula
usually doesn't exist. The repo arrives at numerical integration as the *answer to a
problem*, not as a fallback introduced out of nowhere.

## What "pinning" actually does

A warp marker stores a `{beat, second}` pair — it does **not** store a tempo.
Tempo is *derived* from the slope between adjacent markers. So:

- Pinning is **local**: moving one marker only changes the two segments touching it.
- Drift is **global**: because the map is cumulative, every beat *after* a moved
  marker shifts in absolute seconds.

You cannot pin beat 4 later in the audio than beat 8 already sits — that would mean
time running backwards, and the code rejects it.

## Layout

```
01-the-math/      pure functions, no audio, fully unit-tested. Read this first.
02-visualise/     the integral made visible: tempo curve + draggable warp map.
03-real-audio/    parse a beat_this .beats file and play it back through the map.
04-meter/         the second layer: bar arithmetic. No calculus, just modulo.
05-messy-data/    when the data is messy: anomaly detection on real beat maps.
```

### 01-the-math
Three map functions (`constantMap`, `piecewiseConstantMap`, `linearRampMap`), each
re-deriving its integral in the comments and naming the calculus rule as it is used,
so a reader who took single-variable calculus once, long ago, can follow along.
Plus `pin()` — the warp-marker operation — and a Vitest suite that doubles as worked
examples.

```bash
cd 01-the-math
npm install
npm test
```

### 02-visualise
An interactive explainer that imports `01-the-math` directly (so the picture and the
math can never drift apart): a tempo curve whose shaded area *is* the elapsed-seconds
readout, and a warp-map chart with a draggable marker that calls `pin()` so you can
drag a beat onto a new second and watch the downstream beats move.

### 03-real-audio
The production path. Parses beat_this `.beats` output, builds the tempo model with
`01-the-math`'s code, and plays it back with the playhead following the warp map.
This is also where the real-world wrinkle lives that the teaching layer skips: real
beat maps don't start at beat 0 / second 0, so a pickup-beat offset is needed to
align the first downbeat to a bar boundary.

### 04-meter
A second layer on the same beat axis. Tempo decides *when* a beat happens — that is
the integral. **Meter** decides *what* a beat is called — which beat is a downbeat,
which is interior — and the entire computation is integer division and modulo:

```
positionInBar = (beatIndex - segmentStart) % beatsPerBar
bar           = barsBefore + floor((beatIndex - segmentStart) / beatsPerBar)
```

The interactive demo proves the independence in two ways: a 4/4 → 3/4 preset moves
the accent click to a new beat pattern *while the tempo holds steady*, and a draggable
warp marker shifts every downbeat's second-time without changing which beats are
downbeats. Two edits, two layers, one timeline.

### 05-messy-data
Every example up to here has fed the math a tidy marker list. Real beat_this output
is noisier: timestamps jitter by milliseconds, the tracker occasionally drops or
doubles a beat, and the seconds column can lose monotonicity under careless editing.
This chapter *sees* those problems — `instantaneousBpms` exposes the raw per-segment
BPM signal, `flagAnomalies` reports `too-slow` / `too-fast` / `jump` hits against
tunable thresholds, and `monotonicityHoles` catches the fatal kind (the warp map's
seconds axis going backwards, which makes the inverse undefined). The interactive
inspector renders the BPM line so dropped beats appear as dips and doubled beats
appear as spikes, with flagged segments in red. The chapter stops at detection;
fixing is a judgement call, which is exactly why warp markers are hand-editable.

## Meter is not tempo

It's tempting to bundle meter into the tempo map ("a 4/4 piece is a tempo map plus
some bar info") but this conflates two very different things:

- **Tempo** is the integral `t(β) = ∫₀^β 60/BPM(b) db`. Tempo varies *continuously*
  with audio time, so this is where the calculus lives — three closed-form regimes
  plus one numerical regime, all in `01-the-math`.
- **Meter** is bar arithmetic on the beat axis. A quarter note at 120 BPM lasts 0.5 s
  in 3/4, 4/4, or 7/8 — the meter never changes how long a beat *takes*. What it
  decides is how beats *group*, which is one `% beatsPerBar` per beat. That is the
  whole layer.

The two layers also receive different signals from beat detection. beat_this returns
two parallel lists — *beats* and *downbeats* — and never emits a declared time
signature; the meter is recovered from the *spacing* between downbeats, so a piece
that goes 4/4 → 3/4 shows up as downbeat gaps switching from 4 to 3 with no separate
"time signature changed" event. The "beats per bar" we use here is whatever pulse
beat_this is tracking; finer distinctions like simple vs compound feel (6/8 felt as
two pulses versus six) are a labeling convention on top, not built into the
arithmetic.

A warp edit (dragging a marker) is purely a tempo-layer operation: it slides the
audio time of a downbeat earlier or later. It never changes *which* beat is the
downbeat — that question belongs to the meter layer, which the warp marker doesn't
touch.

## Why calculus, restated

If tempo never changed, none of this would need an integral — it would be one
division. The integral exists precisely *because* tempo varies, and the shape of how
it varies decides how hard it is to evaluate: a step function gives a sum of
rectangles, a linear ramp gives a logarithm, and an arbitrary curve gives no formula
at all — so you integrate it numerically. The same `t(β) = ∫₀^β 60/BPM(b) db` underlies
all four; only the difficulty changes. That is the thing this repo is trying to make
obvious.

## The round trip

The piece that closes the loop, and that a DAW's live BPM readout relies on without
saying so out loud, is the other direction: instantaneous tempo is the *derivative*
of the warp map. Started with `dβ/dt = BPM/60`, integrated it to recover `t(β)`,
inverted that to get `β(t)`. Differentiating `t(β)` gives `BPM(β) = 60·dβ/dt` back —
the very rate we started from. Each map's `bpmAt(β)` is that derivative, evaluated
analytically where a formula exists. A test in `01-the-math/tempo-map.test.js`
estimates the derivative numerically from `beatsToSeconds` and confirms it matches
`bpmAt` across all four regimes — the explicit proof that the integral and the
derivative are two views of the same object.

## License

MIT
