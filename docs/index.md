---
title: warp-math
layout: home

hero:
  name: "warp-math"
  text: "An integral, made visible, made audible."
  tagline: The math behind tempo maps and warp markers, taught in code.
  actions:
    - theme: brand
      text: Start with the integral →
      link: /01-the-integral
    - theme: alt
      text: Source on GitHub
      link: https://github.com/naomiaro/warp-markers

features:
  - title: 01 · The integral
    details: Three closed-form regimes plus one numerical regime, derived in the code comments.
    link: /01-the-integral
  - title: 02 · Visualising the warp
    details: Tempo curve + warp map with a draggable pin. The shaded area IS the integral.
    link: /02-visualising
  - title: 03 · Real audio
    details: Parse beat_this output, build the tempo model, play it back with plain Web Audio.
    link: /03-real-audio
  - title: 04 · Meter is not tempo
    details: A second layer on the same axis — integer division, not calculus.
    link: /04-meter
  - title: 05 · When the data is messy
    details: Detecting dropped beats, doubled beats, and broken monotonicity in real tracker output.
    link: /05-messy-data
  - title: 06 · Fixing a beat map by hand
    details: Where ch.02 (pin) and ch.04 (meter) finally meet. Move, delete, and insert beats against a live meter validator.
    link: /06-repair
  - title: 07 · Ticks are fractional beats
    details: The PPQN grid is the same beat axis in an integer costume — and warping a file onto a project grid is two maps evaluated at the same beat.
    link: /07-ppqn-grid
  - title: 08 · The grid follows the file
    details: The inverse warp, with zero sound change — the beat map becomes the project tempo map, proven equivalent against a production transport.
    link: /08-grid-follows-file
  - title: 09 · Stretching time without bending pitch
    details: Granular overlap-add consumes the SAME per-segment rates chapter 07 fed to varispeed — same math, different engine, pitch untouched.
    link: /09-time-stretch
---

## The one idea

Tempo is a *rate*. "120 BPM" means beats arrive at 120 per minute — 2 per second.
If musical position is $\beta$ (beats) and audio position is $t$ (seconds), tempo is
the derivative of one with respect to the other:

$$\frac{d\beta}{dt} = \frac{\text{BPM}}{60} \quad \text{(beats per second)}$$

We almost always want the other direction — *given a beat, what second is it?* — so
we flip the fraction and integrate. Integrating a rate recovers the total:

$$t(\beta) = \int_{0}^{\beta} \frac{60}{\text{BPM}(b)}\, db$$

That integral is the whole subject. A **warp map** is this function from beats to
seconds; a **warp marker** is a single $(\beta, t)$ point that pins the two together.
Everything else — snapping, playback, stretching, drift — falls out of evaluating
or inverting this integral for different shapes of $\text{BPM}(b)$.

## Four shapes of BPM(b)

| Shape of tempo | The integral becomes | The warp map looks like |
| --- | --- | --- |
| **Constant** $\text{BPM} = K$ | $t = (60/K)\cdot\beta$ (constant rule) | a straight line |
| **Piecewise-constant** (what beat_this gives) | a running sum of rectangles | piecewise-linear, kinking at each marker |
| **Linear ramp** (accelerando) | $t = (60/s)\cdot\ln(\text{BPM}(\beta)/b_0)$ (closed form) | a curve — a logarithm |
| **Curved** (ease in/out, $\text{BPM} = b_0 + \Delta\cdot(\beta/L)^k$) | **no closed form** — integrate numerically | a curve with no simple equation |

The last row is the payoff. For general $k$ the antiderivative of $60/(b_0 + \Delta(b/L)^k)$
has no elementary form — so you stop solving by hand and **evaluate the integral
numerically** with the trapezoidal rule. $k = 1$ recovers the linear ramp exactly;
$k > 1$ eases in; $k < 1$ eases out.

The same integral underlies all four; only the difficulty changes. The chapters
work through them in order.

## The round trip

A live BPM readout is the **derivative** of the warp map coming back around:

$$\text{BPM}(\beta) = 60 \cdot \frac{d\beta}{dt} = \frac{60}{dt/d\beta}$$

Each map's `bpmAt(β)` is that derivative, evaluated analytically where a formula
exists. The test suite confirms the round trip numerically across all four regimes.
