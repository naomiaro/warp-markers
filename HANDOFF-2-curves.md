# Handoff brief 2 — curved tempo (run AFTER HANDOFF.md is complete)

Do not start this until the work in `HANDOFF.md` is finished and committed: the
workspace is consistent, `01-the-math` tests are green through the workspace runner,
and `02-visualise` and `03-real-audio` exist and work. This brief adds a fourth tempo
regime across the layers you just built.

## Context: why a fourth regime

The repo currently teaches three shapes of `BPM(b)` inside the same integral
`t(β) = ∫₀^β 60/BPM(b) db`:

- constant → one division
- piecewise-constant → exact sum of rectangles
- linear ramp → closed-form logarithm

The point of this brief is the case that completes the arc: a **curved** tempo
transition (ease in / ease out), where the integral has **no elementary closed form**
and must be evaluated **numerically**. This is what real DAW tempo automation does, so
it is the payoff, not a footnote.

The README has already been updated to describe this regime (see its three-regimes
table — now four rows — and the "Why calculus, restated" closer). Your job is to make
the code match the prose that is already there. Do not re-edit those README sections
except to fix an outright inaccuracy you introduce.

## Task 1 — add `curvedMap` to `01-the-math/tempo-map.js`

Add a new exported function alongside the existing maps. Keep the existing functions
and their derivation comments untouched.

Signature:

```js
export function curvedMap(startBpm, endBpm, lengthBeats, k = 2)
```

Tempo model — a power curve so it generalizes the linear ramp:

```
BPM(β) = startBpm + (endBpm - startBpm) * (β / lengthBeats)^k
```

- `k = 1` is exactly `linearRampMap` (an ease that is a straight line).
- `k > 1` eases in (slow change first, then rushes).
- `0 < k < 1` eases out.

Return the same shape as the other maps: `{ beatsToSeconds, secondsToBeats, bpmAt }`.

Implementation notes to put in the comments (this is teaching code — derive, don't just
assert):

- State plainly that `∫ 60 / (startBpm + Δ·(b/L)^k) db` has no elementary
  antiderivative for general `k`, which is *why* we integrate numerically here when the
  earlier regimes had formulas. Name the method: the **trapezoidal rule** — approximate
  the area under `60/BPM(b)` with thin trapezoids and sum them. Note that the error
  shrinks as the slice count grows; a few hundred slices is plenty for audio time.
- `beatsToSeconds(beta)`: trapezoidal sum of `60/bpmAt` from 0 to `beta`. (The earlier
  interactive used ~400 steps; reuse that order of magnitude.)
- `secondsToBeats(t)`: there is no closed-form inverse either. Since `beatsToSeconds`
  is monotonically increasing, invert by **bisection** (binary search on β until
  `beatsToSeconds(β)` is within tolerance of `t`). Comment on why bisection is safe
  here (monotonic ⇒ exactly one solution).
- Guard `k <= 0` and `lengthBeats <= 0` with a thrown error.

## Task 2 — tests in `01-the-math/tempo-map.test.js`

Match the existing style: each `it()` states the property in words, then checks it
numerically with the `close()` helper already in the file. Add a `describe("curved
tempo (numerical integration)", ...)` block with at least:

1. **k = 1 reproduces the linear ramp** — `curvedMap(120, 240, 8, 1)` must agree with
   `linearRampMap(120, 240, 8)` at several β to a sensible tolerance (numerical vs.
   closed form, so use ~1e-3, not 1e-6, and say so in a comment).
2. **round-trips** — `secondsToBeats(beatsToSeconds(β)) ≈ β` for several β (the
   bisection inverse; tolerance ~1e-4).
3. **ease-in lands later than linear** — for `k = 2` accelerando, the early section is
   slower than the linear ramp, so `curved.beatsToSeconds(mid)` should exceed
   `linear.beatsToSeconds(mid)` at the midpoint. Assert the direction.
4. **start == end collapses to constant** — `curvedMap(150, 150, 8, 2)` agrees with
   `constantMap(150)`.

Keep every previously passing test green. Commit: `feat(math): curved tempo via
numerical integration`.

## Task 3 — fourth mode in `02-visualise`

Add a "Curved" option to the regime switch, wired to `curvedMap`. Requirements:

- A slider for the easing exponent `k` (range roughly 0.25–4, default 2), shown only in
  this mode.
- Same invariant as the other modes: the shaded area under `60/BPM` must equal the
  elapsed-seconds readout — here that area is the *numerical* integral, which is the
  visible point. Consider a one-line caption in this mode noting the area is being
  summed from slices, not from a formula.
- The warp-map chart should render the curve from `beatsToSeconds`. Dragging warp
  markers stays a piecewise-constant concern (that is what beat_this produces); you do
  not need draggable pins on the curved map unless it falls out naturally. If you skip
  it there, say so in a code comment so it is a decision, not an omission.

Commit: `feat(visualise): curved tempo mode with easing exponent`.

## Out of scope (don't build unless asked)

- Bézier / spline tempo lanes and constant-jerk formulations. The power curve is the
  one that teaches the "no closed form ⇒ integrate numerically" idea most directly;
  splines add machinery without adding insight. Leave a one-line note in the README's
  curved section pointing at them as further reading if you like, but do not implement.
- Changing `03-real-audio`. beat_this output is inherently piecewise-constant, so the
  curved regime is a teaching/automation concept, not something that maps onto a parsed
  `.beats` file. Leave that folder alone.

## Working agreement (unchanged)

- `01-the-math` tests green at every commit; add tests when you extend it.
- Small, labelled commits per task.
- Do not alter the derivation comments in the existing three maps.
- Ask before adding heavy dependencies (the trapezoidal rule and bisection are a few
  lines each — no library needed).
