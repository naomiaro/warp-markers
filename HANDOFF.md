# Handoff brief for Claude Code

Paste this whole file (or its contents) to Claude Code once you have the repo open.
It describes the project, what already exists, and what to build next.

---

## Project

`warp-math` — an educational repo for the math behind tempo maps and warp markers
(pinning an audio moment to a beat, and stretching time between pins). It is read in
order across three folders, each raising fidelity:

- `01-the-math/` — pure, unit-tested functions. **Already written. Do not rewrite the
  derivations or change the public function signatures.** Read it first to learn the API.
- `02-visualise/` — interactive explainer importing `01-the-math`. **You build this.**
- `03-real-audio/` — beat_this playback through the map. **You build this.**

The core idea, for context: a warp map is the function `t(β) = ∫₀^β 60/BPM(b) db`
(beats → seconds). A warp marker is a `{beat, second}` pin; tempo is *derived* from
the slope between markers, never stored. See `README.md` for the full explanation.

## What already exists

`01-the-math/` exports (ES modules, `type: "module"`):

- `tempo-map.js`
  - `segmentBpm(a, b)` → BPM implied between two markers
  - `constantMap(bpm)` → `{ beatsToSeconds, secondsToBeats, bpmAt }`
  - `piecewiseConstantMap(markers)` → same shape, plus `.markers`.
    Requires markers sorted, starting at `{beat:0, second:0}`.
  - `linearRampMap(startBpm, endBpm, lengthBeats)` → same shape
- `warp-marker.js`
  - `pin(model, beat, second)` → new model array (immutable; throws if it makes time
    non-monotonic)
  - `describePin(model, beat)` → `{ incomingBpm, outgoingBpm }`
- `tempo-map.test.js` — 12 Vitest cases. `npm test` in that folder must stay green.

## First task: make the workspace consistent

1. The repo root has a `package.json` declaring npm workspaces for the three folders.
2. `01-the-math/package.json` currently has `"name": "warp-math"`, which collides with
   the root. Rename it to `"@warp-math/the-math"` (and give the other two folders
   `"@warp-math/visualise"` and `"@warp-math/real-audio"` when you create them).
3. From the repo root, run `npm install` then `npm test` and confirm `01-the-math`'s 12
   tests pass through the workspace runner before doing anything else. Commit:
   `chore: set up npm workspaces`.

## Build 02-visualise

Goal: the integral made visible, wired to the *real* functions so the picture and the
math cannot drift apart. Use Vite + vanilla JS (no framework needed) and Chart.js, or
your judgement if you prefer something lighter.

Two synced charts:

1. **Tempo curve** — `bpmAt` (or `60/bpm`) plotted against beat position. The shaded
   area under `60/BPM` must equal the elapsed-seconds value shown in a readout —
   because that area *is* `beatsToSeconds`. Let the user switch between the three
   regimes (constant / piecewise-constant / linear ramp) and adjust tempos with sliders.
2. **Warp map** — `beatsToSeconds` plotted as beats (x) → seconds (y), with markers as
   draggable dots. Dragging a dot calls `pin(model, beat, newSecond)` from
   `warp-marker.js`, rebuilds the map via `piecewiseConstantMap`, and re-renders. The
   user should *see* downstream beats shift while pinned beats stay fixed, and see the
   `describePin` tempos update at the dragged marker. Reject (snap back) drags that
   `pin()` throws on.

Import directly from the workspace, e.g. `import { piecewiseConstantMap } from
'@warp-math/the-math/tempo-map.js'`. Do not reimplement any map math in this folder.

Commit when the drag-to-pin loop works end to end.

## Build 03-real-audio

Goal: the production path, showing the same integral driving playback.

1. Parse a beat_this `.beats` file (lines of `time  beatNumber`; downbeat is
   `beatNumber === 1`). There is a sample format documented in beat_this's README.
2. Build the tempo model from the parsed beats using `01-the-math` (each beat is a
   marker). **Handle the real-world wrinkle the teaching layer skips:** real beat maps
   do not start at beat 0 / second 0, so compute a pickup-beat offset that aligns the
   first downbeat to a bar boundary, and document it in comments. (Naomi Aro's
   `beat-map-grid.html` in the waveform-playlist repo is the reference for this offset
   logic — read it but write your own clean version against the `01-the-math` API.)
3. Web Audio playback with a playhead whose on-screen position follows
   `secondsToBeats` / `beatsToSeconds`. A waveform under the grid is a bonus, not
   required for the first pass — wavesurfer.js or peaks.js if you want it quickly.
4. Add a `03-real-audio/audio/.gitkeep` and keep large audio out of git (the root
   `.gitignore` already does this). Ship one tiny sample clip + its `.beats` only if
   it is small and license-clean.

Optional but nice: a debug overlay plotting `01-the-math`'s `beatsToSeconds` against
samples of the playback clock to show they agree.

## Working agreement

- Keep `01-the-math` tests green at every commit; add tests there if you extend it.
- Small, labelled commits per milestone.
- Do not change the derivation comments in `01-the-math` — they are the teaching content.
- Ask me before adding heavy dependencies.
