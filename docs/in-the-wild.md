# Appendix · In the wild: how DAWs import audio and find its tempo

Every chapter in this tutorial begins after a quiet miracle: a beat map exists. This appendix is about where that map comes from in commercial DAWs — what actually happens in the second after you drag an audio file into Ableton, Logic, or Reaper — and where each step lands in the chapters you've just read.

The short version: DAWs read metadata if they can, solve arithmetic if the file is short, run cached beat-tracking analysis if they must, and then hand the one genuinely musical decision — *who bends, the file or the grid?* — to the user. That decision space is exactly chapters [07](/07-ppqn-grid), [08](/08-grid-follows-file), and [09](/09-time-stretch).

## 1 · Trust metadata before listening

Detection is a last resort. First the DAW checks whether the file *announces* its tempo:

- **Filename parsing** — `drum_loop_128bpm.wav` is honored by most DAWs, no analysis run.
- **Embedded chunks** — ACIDized WAVs carry tempo and bar-count metadata; Apple Loops carry transient tables and tempo; REX files carry slice positions outright.

When any of these exist, the file arrives with its beat map precomputed — the same situation this tutorial engineers by starting from a `.beats` file. Chapter [03](/03-real-audio)'s premise ("parse the beat list, build the model") is the metadata path, not an idealization.

> **Further reading.** [Different types of audio file formats](https://help.timespace.com/home/different-types-of-audio-file-formats) (Time+Space) — a side-by-side of what ACID, Apple Loops, and REX2 each embed. Ableton's own cached map is the `.asd` sidecar: [What Are ASD Files in Ableton?](https://www.soundalgorithm.io/ableton-guides/what-are-asd-files/), and [DBraun/AbletonParsing](https://github.com/DBraun/AbletonParsing) parses one in Python — its warp-marker records are this repo's `{beat, second}` pairs by another name.

## 2 · The loop-length heuristic (and the octave error)

For short files there is often no detection at all — just algebra. Assume the file is a whole number of bars (1, 2, 4, 8) of 4/4, compute the BPM that makes the duration fit each guess, and keep the candidate in a plausible range (engines bias toward roughly 80–160 BPM). A 2.000 s file becomes "4 beats at 120 BPM" by assumption, not by listening.

Two valid answers usually survive, half and double of each other — which is why the classic import failure is the **octave error**: the 8-bar loop read as 4 bars at half tempo. Nothing was misheard; the arithmetic simply had two roots and the prior picked the wrong one.

> **Further reading.** The octave error has its own MIR literature: [Addressing Tempo Estimation Octave Errors in Electronic Music](https://www.ifs.tuwien.ac.at/~knees/publications/hoerschlaeger_etal_smc_2015.pdf) (SMC 2015) and [Beat Tracking Octave Error Identification by Metrical Profile](https://archives.ismir.net/ismir2010/paper/000019.pdf) (ISMIR 2010) both attack exactly the "two roots, wrong prior" problem.

## 3 · Real analysis, run once, cached forever

For full songs the pipeline is genuine MIR: **onset detection** (spectral flux) → **tempo induction** (autocorrelation / tempogram of the onset envelope) → **beat tracking** (classically dynamic programming, in modern engines and academia neural networks — [beat_this](https://github.com/CPJKU/beat_this), this tutorial's tracker, is the current academic strong baseline).

Two production details matter more than the algorithm:

- **The result is a sidecar file.** Ableton writes `.asd` next to the audio; Logic stores Flex analysis in the project. Inside is a list of warp markers — literally this repo's `{beat, second}` pairs. Analysis runs once at import; everything afterward — playback, snapping, stretching — is the pure map math of chapters [01](/01-the-integral) through [10](/10-bar-arithmetic), evaluated on cached anchors.
- **It is expected to be wrong somewhere.** Ghost beats, octave errors, drifting downbeat phase — every DAW pairs detection with a hand-repair UI (double-click a warp marker, drag it). That workflow is chapters [05](/05-messy-data) and [06](/06-repair), which is to say: messy data and repair aren't a pedagogical detour, they're the half of the import pipeline DAWs hide behind the clip editor. This repo's own fixtures demonstrate the failure catalogue on real tracker output: a ghost beat (*Otherside*), a mislabeled final downbeat (*Scar Tissue*), downbeat-phase noise (*Bastard*).

> **Further reading.** [Audio Processing: Beat Tracking Explained](https://audioxpress.com/article/audio-processing-beat-tracking-explained) (audioXpress) walks the onset → tempo-induction → beat-tracking pipeline in prose; [Better Beat Tracking Through Robust Onset Aggregation](https://www.ee.columbia.edu/~dpwe/pubs/McFeeE14-beats.pdf) (McFee & Ellis) is the dynamic-programming tracker this section calls "classical."

## 4 · Then the user answers the triptych question

Once a beat map exists, file and grid must be reconciled, and DAWs surface precisely three choices:

| The DAW calls it | What happens | Chapter |
| --- | --- | --- |
| Ableton **Re-Pitch** warp mode | conform file to grid, cheaply — varispeed; pitch scales with rate | [07](/07-ppqn-grid) |
| Ableton **Set tempo from clip**, Logic Smart Tempo **ADAPT** | conform grid to file — the project tempo map becomes the beat map; audio untouched | [08](/08-grid-follows-file) |
| Ableton **Beats / Tones / Complex**, Logic Flex Time | conform file to grid, pitch preserved — granular / transient / phase-vocoder stretching | [09](/09-time-stretch) |

One detail confirms chapter 09's thesis from inside the products: Ableton lets you switch a clip's warp *mode* without touching its warp *markers*. The anchors and rates are engine-agnostic; only the consumer changes. That is `segmentRates()` being shared between `playbackRate` and a grain scheduler, shipping in every DAW.

> **Further reading & watching.** Ableton: [Understanding Warp Modes](https://www.youtube.com/watch?v=LJPQucPFEhc) (video), [Warp modes explained](https://www.adsrsounds.com/ableton-live-tutorials/ableton-live-warp-modes-explained/) (ADSR), and the [Audio Clips, Tempo, and Warping](https://www.ableton.com/en/manual/audio-clips-tempo-and-warping/) reference manual. Logic: [Logic's Smart Tempo: Part 1](https://www.soundonsound.com/techniques/logics-smart-tempo-part-1) (Sound on Sound, the ADAPT/KEEP grid-follows-file path) and the [Flex Time and Pitch overview](https://support.apple.com/guide/logicpro/flex-time-and-pitch-overview-lgcp15968647/mac). Reaper: [tightening timing with Stretch Markers](https://jonathanslattermusic.uk/how-to-tighten-the-timing-of-audio-in-reaper-using-stretch-markers/).

## 5 · What they mostly don't do: meter

Commercial DAWs overwhelmingly assume 4/4 on import, let the user confirm where bar 1 falls (the pickup / clip-offset anchoring from chapter [08](/08-grid-follows-file)), and leave time-signature changes to be entered by hand. Automatic downbeat detection is the weakest link even in research-grade trackers — *Bastard*'s 73 detected meter regions in chapter [10](/10-bar-arithmetic) are part music, part phase noise, and telling those apart is a judgement call (chapter [06](/06-repair)'s founding principle), not arithmetic.

So if this tutorial has a one-sentence relationship to the products: **the DAWs run the same pipeline, cache the same pairs, and hide the same math — the chapters just turn the lights on.**
