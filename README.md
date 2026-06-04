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

## Why calculus, restated

If tempo never changed, none of this would need an integral — it would be one
division. The integral exists precisely *because* tempo varies, and the shape of how
it varies decides how hard it is to evaluate: a step function gives a sum of
rectangles, a linear ramp gives a logarithm, and an arbitrary curve gives no formula
at all — so you integrate it numerically. The same `t(β) = ∫₀^β 60/BPM(b) db` underlies
all four; only the difficulty changes. That is the thing this repo is trying to make
obvious.

## License

MIT
