# 02 · Visualising the warp

The integral $t(\beta) = \int_0^\beta 60/\text{BPM}(b)\, db$ is the whole subject.
Drawing both sides of it side by side makes the equality literal:

- **Left chart:** $60/\text{BPM}(b)$ — seconds per beat. The shaded region from $0$ to the
  cursor is the *area* under the integrand on that interval.
- **Right chart:** $t(\beta)$ — the warp map itself. The y-value at the cursor IS that
  shaded area.

Move the cursor and watch both numbers — `beatsToSeconds(β)` and the trapezoidal
area under $60/\text{BPM}$ — track each other to numerical-noise tolerance for the
closed-form regimes and exactly for the curved one (where they share the same
quadrature).

<VisualiseDemo />

## What to notice

- In **constant** mode the left chart is a flat line; the shaded rectangle is
  literally $\beta \cdot (60/K)$.
- In **piecewise** mode the left chart is a step function; the shaded "area so far"
  is the running sum of completed rectangles plus a partial one. Drag the orange dots
  in the right chart to call `pin()` and watch downstream beats shift in time while
  pinned beats stay fixed (a drag that would make time non-monotonic is rejected and
  snaps back).
- In **linear ramp** mode the left chart bends — $60/\text{BPM}$ is a reciprocal-of-line,
  not a line — and the right chart's logarithmic shape is visible directly.
- In **curved** mode there is no formula; the right chart is the trapezoidal sum
  evaluated at every $\beta$.

<!--@include: ./.generated/warp-marker-intro.md-->
