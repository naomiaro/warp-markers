# 09 · Stretching time without bending pitch

[Chapter 07](/07-ppqn-grid) computed everything a DAW needs to warp a wobbly file onto a rigid grid — the beat-pairing table from `alignBeats`, and from `segmentRates` a per-segment **rate**: source seconds consumed per project second. Then it spent those rates the cheapest way possible, on `playbackRate`. That is **varispeed**, the tape-machine trick, and it has a famous side effect: rate scales pitch. A segment at rate 1.2 plays 20% faster and sounds about +3.2 semitones sharp. The beats land; the song changes key.

[Chapter 08](/08-grid-follows-file) escaped by refusing to touch the audio at all — invert the direction, bend the *grid* to the file. Honest, free, and sometimes exactly right. But it only works when the project is willing to inherit the file's tempo. The moment two files with different wobbles must share one grid, somebody's audio has to move.

This chapter completes the triptych: change the timing **without** changing the pitch. Chapter 07 bends the sound. Chapter 08 bends the grid. Chapter 09 bends neither — it slices.

And the thesis, the reason this chapter belongs in a math repo rather than a DSP one: **the warp math does not change.** The same anchors, the same per-segment rates chapter 07 fed to `playbackRate`, drive this engine untouched. Varispeed *plays* the warp function; granular synthesis *samples* it. Same math, different engine — which means the rates a DAW persists for a warped clip are engine-agnostic, and swapping the time-stretch algorithm under a project never moves a single warp marker.

<!--@include: ./.generated/granular-intro.md-->

## Why 50% overlap is special: Hann and COLA

Raw grain edges would click — a waveform chopped at an arbitrary sample jumps discontinuously. So every grain is shaped by a window that fades in from 0 and out to 0, and neighbouring grains overlap so the fades crossfade. The window is the raised cosine (**Hann**), over normalized grain time $t \in [0, 1]$:

$$
w(t) \;=\; \tfrac{1}{2}\bigl(1 - \cos 2\pi t\bigr) \;=\; \sin^2(\pi t)
$$

The $\sin^2$ form is the one that earns its keep. At 50% overlap, the neighbouring grain sits exactly half a window later, and sine shifted by half a period is cosine:

$$
w\!\left(t + \tfrac{1}{2}\right) = \sin^2\!\left(\pi t + \tfrac{\pi}{2}\right) = \cos^2(\pi t)
$$

so wherever two grains overlap, their gains sum to

$$
w(t) + w\!\left(t + \tfrac{1}{2}\right) \;=\; \sin^2(\pi t) + \cos^2(\pi t) \;=\; 1
$$

— the Pythagorean identity, doing audio engineering. The summed envelope is a flat $1$: the output level neither pumps nor dips as grains come and go. This property is called **constant-overlap-add** (COLA), and it is special to this pairing of window and overlap. At other overlap fractions the Hann sum ripples, which is why the demo normalizes by the actual window sum rather than assuming unity.

## The grain-advance rule, in numbers

The wobbly fixture (beats 1–16, segments at 100 / 120 / 150 / 120 BPM) warped onto a 120 BPM project, with the default 0.08 s grains at 50% overlap — so a grain starts every $\text{outputHop} = 0.08 \times (1 - 0.5) = 0.04$ s of project time. Between consecutive grains the source read position advances by $\text{outputHop} \times \text{rate}$:

| Beats | Segment BPM | Rate | Output hop | Source hop |
| ----- | ----------- | ---- | ---------- | ---------- |
| 1 → 5 | 100 | $120/100 = 1.2$ | 0.040 s | **0.048 s** |
| 5 → 9 | 120 | $120/120 = 1.0$ | 0.040 s | 0.040 s |
| 9 → 13 | 150 | $120/150 = 0.8$ | 0.040 s | **0.032 s** |
| 13 → 16 | 120 | $120/120 = 1.0$ | 0.040 s | 0.040 s |

One concrete pair: the grain at output time 0.5 s (beat 1's slot on the grid) reads source position 0.25 s — the anchor, exactly. The next grain, 0.04 s later at 0.54 s, reads $0.25 + 1.2 \times 0.04 = 0.298$ s. The source is being hopped through 20% faster than the output clock — material is skipped — yet every grain plays at rate 1.0, so nothing in it bends. Where rates run below 1 (the 150 BPM block), the hops shrink and material is *re-read* instead; the window crossfades both kinds of seam.

## Honest limits

Granular overlap-add is the simplest pitch-preserving stretch, and its failure modes are audible and worth naming:

- **Transients smear.** A drum hit caught by two overlapping grains is played twice, slightly offset, under crossfading windows — the attack softens. Re-read regions (rate < 1) make this worse.
- **Grain size is a trade, not a setting.** Short grains track the warp tightly but impose their own envelope periodicity on the sound (a warble around $1/\text{hop}$ Hz); long grains smooth the warble but smear timing and double transients more.
- **Real DAWs use fancier engines** — transient-aware segmentation, phase vocoders, and beyond. The point of this chapter is precisely that none of that matters to the warp layer: the anchors and rates are engine-agnostic, and a better stretcher consumes the *same* plan.

## Hear it

<p><a href="/warp-markers/demos/09-time-stretch/" target="_blank" rel="noopener">Open the standalone demo ↗</a> — the triptych with a mode switch: <em>raw</em> drifts off the metronome, <em>varispeed</em> locks the beats and changes the key, <em>granular</em> locks the beats and keeps it. The default source is a synthetic arpeggio (one tone per file beat — tones, not clicks, because you cannot hear varispeed detune a click). The grain engine is exactly the paragraph above made literal: each `{ outputSec, sourceSec, durationSec }` grain is an `AudioBufferSourceNode` started at `outputSec`, reading from offset `sourceSec` at `playbackRate` 1.0, through a gain node shaped by `grainGainAt` — that is the entire engine. Drag the grain-size knob to hear the warble↔smearing trade from the list above; the grain lattice is drawn on the timeline, tinted by rate, and the schedule table shows RULE (grain advance) recovering the local rate from consecutive source deltas.</p>
