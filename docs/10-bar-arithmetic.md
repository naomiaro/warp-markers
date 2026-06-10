# 10 · Bars that change size

[Chapter 04](/04-meter) taught meter as bar arithmetic — one `%`, one `/` — and it
was honest about its simplification: one time signature, forever. Real files don't
cooperate. The Ben Folds *Bastard* fixture that [chapter 08](/08-grid-follows-file)
derived meter entries from has **73 meter regions**, with bars of anywhere from 1 to
7 beats. A bar number like "bar 41" only means something if the counting survives
every one of those changes.

The good news: surviving them costs exactly **one cached number per meter entry** —
how many bars came before it. This is the same trick the tempo map pulled in
chapter 01, on a different axis. The tempo map caches *seconds* at each tempo entry
so that "what time is tick T?" never re-walks every segment; the meter map caches
*bars* at each meter entry so that "which bar is tick T in?" never does either.
Both turn "walk all segments" into "find the segment, then one division."

<!--@include: ./.generated/bar-atlas.md-->

## The fixture, worked

ppqn 960, four regions — a miniature of the real file's shape:

$$
\texttt{ticksPerBeat}_k = \frac{\texttt{ppqn} \cdot 4}{\texttt{denominator}_k}
\qquad
\texttt{ticksPerBar}_k = \texttt{numerator}_k \cdot \texttt{ticksPerBeat}_k
$$

| entry tick | meter | ticksPerBar | barAtTick |
| ---------- | ----- | ----------- | --------- |
| 0          | 4/4   | 3840        | 0         |
| 7680       | 3/4   | 2880        | 2         |
| 13440      | 7/4   | 6720        | 4         |
| 20160      | 2/4   | 1920        | 5         |

From the atlas, every bar start is one multiplication away:

| bar | starts at tick | meter | length (ticks) |
| --- | -------------- | ----- | -------------- |
| 1   | 0              | 4/4   | 3840           |
| 2   | 3840           | 4/4   | 3840           |
| 3   | 7680           | 3/4   | 2880           |
| 4   | 10560          | 3/4   | 2880           |
| 5   | 13440          | 7/4   | 6720           |
| 6   | 20160          | 2/4   | 1920           |
| 7   | 22080          | 2/4   | 1920           |
| 8   | 24000 *(extrapolated)* | 2/4 | 1920    |

Past the last entry, its meter extrapolates forever — the step convention used
repo-wide. And the queries are exact inverses on bar starts:
`barForTick(atlas, tickForBar(atlas, b))` returns bar `b` at `beatInBar` 1, for
every `b`, including bars in the extrapolated region. The test suite states this
as the round-trip property and proves the whole module equivalent to the
production `MeterMap` from `@dawcore/transport`, tick by tick — the same
treatment chapter 08 gave the `TempoMap`.

## Why a mid-bar meter change is rejected, not absorbed

The atlas recurrence divides each region's length by its bar length:

$$
\texttt{barAtTick}_{k+1} = \texttt{barAtTick}_k +
\frac{\texttt{tick}_{k+1} - \texttt{tick}_k}{\texttt{ticksPerBar}_k}
$$

That division must come out an integer. If a meter entry lands mid-bar of the
meter before it, the previous region contains a fractional number of bars — and
there is no honest way to absorb that. Round it down and the new region's first
bar silently swallows the orphaned beats; round it up and a bar that never
finished gets counted as whole. Either way, **every bar number after that point
is corrupted**, and so is everything built on bar numbers: loop regions, the
metronome's downbeat accent, "go to bar 41." So the constructor throws instead,
exactly as the production `MeterMap`'s validation does. A meter map that accepts
a mid-bar change isn't being flexible; it's deferring the corruption to whoever
reads it next.

The same hard line applies to the beat unit itself: `ticksPerBeat = ppqn · 4 /
denominator` must be an integer, because a fractional tick cannot be addressed.
At ppqn 960 every common denominator works; at ppqn 6, a /16 meter would need
1.5 ticks per beat, and both this module and the production one refuse it.

## What arithmetic can't decide

One honest caveat to close the curriculum's arithmetic. In real tracker output,
some "meter changes" aren't music at all — they're **downbeat-phase noise**. A
beat tracker that drops or doubles a single downbeat manufactures a spurious
1-beat bar, and the meter-entry derivation of [chapter 08](/08-grid-follows-file)
will faithfully report it as a region. The *Bastard* file's 73 regions include
both kinds: genuine 7/4 and 2/4 bars Ben Folds actually wrote, and one-beat
stutters that are artifacts of detection.

This chapter's math treats both identically, and that is correct behavior: the
arithmetic's job is to count what the entries declare, exactly. Deciding which
regions are music and which are mistakes requires listening, context, and
judgment — a human with a repair tool, not a recurrence. That is
[chapter 06](/06-repair)'s territory, and it's why the repair tool exists.
