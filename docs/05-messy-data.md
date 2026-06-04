# 05 · When the data is messy

Every example up to here has fed the math a tidy marker list. Real beat_this
output is noisier:

- timestamps jitter by milliseconds,
- the tracker occasionally **drops** a beat (gap to next beat $\approx 2\times$
  normal),
- or **doubles** a beat (gap $\approx 0.5\times$ normal),
- and very rarely a downstream edit makes the seconds column **non-monotonic**,
  which is the one thing the warp map genuinely cannot survive (`secondsToBeats`
  loses its inverse the moment seconds stop strictly increasing).

This chapter *sees* those problems — it does not fix them. Fixing is a
judgement call (snap to grid? interpolate? hand back to the user?) that belongs
to the application, not to the math. The whole point of warp markers being
hand-editable is that the human is the final arbiter.

<!--@include: ./.generated/messy-intro.md-->

## Three detectors, one in numerical truth

```text
instantaneousBpms(markers)        // raw signal: per-segment BPM, NaN on bad pairs
flagAnomalies(markers, opts)      // heuristic: too-slow, too-fast, jump
monotonicityHoles(markers)        // fatal: indices where the inverse breaks
```

The first two are heuristics. The thresholds are exposed so you can tune them per
genre or per detector. The third is not a heuristic — it is exactly the failure
mode chapter 01's `pin()` guards against at edit time, detected after the fact
in data that didn't go through `pin()`.

## What dropped, doubled, and broken look like

A clean recording is a flat line in this view. A **dropped beat** appears as a dip
(the implied BPM is roughly halved because the inter-beat gap doubled). A
**doubled beat** appears as a spike (the implied BPM doubles because the gap is
halved). The flagged segments turn red; the rest stay green.

<MessyDataDemo />

<p><a href="/warp-markers/demos/05-messy-data/" target="_blank" rel="noopener">Open the full-screen standalone demo ↗</a> — has threshold inputs and a wider chart.</p>

Click *non-monotonic* and watch the red banner appear above the table: that is the
detector telling you the warp map's seconds axis went backwards, so `secondsToBeats`
has no single answer at that $t$. The standalone demo and this one share the same
`@warp-math/messy-data` package — the inspector here is a Vue mount shim around
the same functions the chapter's test suite covers.

## Why this chapter stops at detection

A real DAW could snap a flagged beat to the nearest grid point, or interpolate
across a dropped beat, or hand the user a "fix this" dialog. Each is reasonable in
context. None of them belongs in the math layer, because each requires deciding
*which* approximation is acceptable for this particular piece of music. The repo's
position is that the math layer detects and reports; the human re-pins.
