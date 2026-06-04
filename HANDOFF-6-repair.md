# Handoff brief 6 — chapter 06: hand-repairing a beat map (run after the docs site exists)

Run after chapters 01–05 and the VitePress site (HANDOFF-5-docs) are done and committed.
This adds a NEW chapter `06-repair/` and a sixth-plus-one docs page. It builds directly
on chapter 02's `pin()` interaction, chapter 04's meter layer, chapter 05's anomaly
detection, and chapter 03's `.beats` parsing — so it should reuse those, not reinvent
them.

## The teaching frame: detection → repair

Chapter 05 *detects* problems and deliberately stops there ("detecting, not fixing").
Chapter 06 is the other half: the user *repairs* a mostly-correct beat map by hand. This
is where warp markers stop being a concept and become a tool you manipulate with intent.

It is also the chapter where the two layers built separately finally operate together:
you need the **tempo layer** (`pin()` from ch.02 — markers in beat/second space) AND the
**meter layer** (`barPositionOf` from ch.04 — which beat is a downbeat, how many beats a
bar has) to even *see* the error. An accidental extra beat in a 4/4 bar is invisible in
pure tempo terms — it only shows up as "this bar has 5 beats" once meter is overlaid.
Make this synthesis explicit in the prose: ch.06 is where ch.02 and ch.04 meet.

## The three error types and their repairs

Be precise about this in code comments and prose — they are different operations:

- **Extra / doubled beat** (tracker fired twice for one real beat): the bar has too many
  beats. Repair = **delete** a marker. This is the headline case the user asked for.
- **Dropped / missing beat** (tracker missed one): the bar has too few. Repair =
  **insert** a marker at the right time.
- **Mistimed beat** (right count, wrong position — jitter): repair = **move** a marker.
  This is exactly ch.02's drag-the-pin, reused.

The demo must support all three: **move + delete + insert.**

## Build the chapter

### Task 1 — `06-repair/repair.js`, pure operations

Create `06-repair/` (`"name": "@warp-math/repair"`, add to root workspaces). Pure,
testable functions building on existing chapters — import, don't duplicate:

- `deleteBeat(markers, index)` → new markers array without that beat. Re-index downstream
  beats. Comment: after deletion the two adjacent segments merge and the derived tempo
  re-computes from the wider gap (ties back to ch.01 `segmentBpm`).
- `insertBeat(markers, second)` → new markers array with a beat at `second`, sorted,
  re-indexed. Reject (throw) if it duplicates an existing time or breaks monotonicity
  (reuse the monotonicity guard concept from ch.04 `pin()`).
- `moveBeat(markers, index, newSecond)` → thin wrapper over ch.02's `pin()` semantics for
  a single beat; keep the same non-monotonic rejection.
- `validateAgainstMeter(markers, downbeatIndices, expectedBeatsPerBar)` → using ch.04's
  `barPositionOf` / `meterMapFromBeats`, return per-bar `{ bar, beatCount, ok }` so the UI
  can show which bars currently have the wrong count. `ok` = beatCount matches the
  expected meter for that bar. This is what drives "live validation" in the UI.

Note in comments: deleting/inserting a beat changes beat *indices*, so the downbeat set
must be recomputed (a deleted beat can shift which absolute beats are downbeats). Handle
this — it is the subtle bug in naive implementations.

### Task 2 — `.beats` round-trip (import + export)

Users will upload real beat_this output and want the corrected version back.

- Reuse chapter 03's `.beats` parser (beat_this TSV: `time<TAB>beatNumber`, downbeat is
  beatNumber 1). If ch.03 didn't expose it as an importable function, refactor it into a
  shared spot both chapters import (e.g. a tiny `shared/beats-io.js` workspace, or export
  it from ch.03). Do not copy-paste the parser.
- Add `exportBeatsTsv(markers, downbeatIndices)` → a string in the SAME format
  beat_this produces, so a corrected file is a drop-in replacement. Round-trip test:
  parse → export → parse yields identical data.

### Task 3 — `06-repair/repair.test.js`

Worked-example style (state property, then check). Cover at least:

1. A bar with an extra beat: `validateAgainstMeter` flags it as `ok:false` with
   beatCount 5 in a 4/4 context; after `deleteBeat` on the spurious beat, the bar is
   `ok:true` and the adjacent tempo re-derives sensibly.
2. A dropped beat: flagged as too few; `insertBeat` at the gap midpoint restores the count.
3. `moveBeat` rejects a non-monotonic move; accepts a valid nudge.
4. Downbeat recomputation: deleting a beat before a downbeat shifts the absolute index of
   that downbeat correctly (the subtle bug above).
5. `.beats` round-trip: parse → export → parse is identity on a fixture.

Commit: `feat(repair): hand-edit operations with meter validation`.

### Task 4 — the interactive demo (the centerpiece)

Same toolchain as the other demo components; mount client-side (SSR guard — this is the
ch.05/02 lesson, don't regress it). Requirements, reflecting the user's three choices:

**Editing — move + delete + insert:**
- Draggable markers (move) reusing the ch.02 pin interaction.
- Click a marker to select; a delete control (or right-click / delete key) removes it.
- Click empty grid space to insert a beat at that time.
- Every edit runs through the `repair.js` functions and re-renders; rejected edits
  (non-monotonic, duplicate) snap back with a brief inline reason.

**Correctness signalling — BOTH target + live validation:**
- Show the target up front (e.g. a labelled "Target: 4/4 throughout" or a per-section
  target if the fixture changes meter).
- Live: render each bar shaded by `validateAgainstMeter` — bars with the right beat count
  glow green/ok, wrong-count bars are flagged (red/amber) with the actual count shown
  ("5 beats — expected 4"). Updates on every edit so the user sees a bar go green the
  instant they delete the stray beat. A small "all bars correct ✓" state when done.

**Data source — default fixture AND user upload:**
- Ship a default broken map inline: mostly-correct, with at least one extra beat in a bar
  and ideally one dropped beat elsewhere, so all three repair ops are exercisable on the
  default. A "reset to default" control.
- A file input accepting a `.beats` file: parse via the shared parser, load into the
  editor. Handle real-world mess gracefully — if parsing fails or the file isn't the
  expected format, show a clear inline error, don't crash the demo. (This is genuinely
  the riskiest part; uploaded files are not clean fixtures.)
- A "download corrected .beats" button that calls `exportBeatsTsv` and triggers a client
  download. This closes the loop: upload broken → fix by hand → download corrected.

**Privacy / safety for uploads:** parsing happens entirely client-side in the browser;
no upload leaves the page. State this in the UI ("your file stays in your browser") since
users may drop real project files. Do not add any network send.

Commit: `feat(repair): interactive hand-repair demo with upload and export`.

### Task 5 — docs page + nav

- Add `06 Repair` (title e.g. "06 · Fixing a beat map by hand") to the VitePress nav and
  sidebar, after 05.
- Write the page: the detection→repair framing, the three error types and their
  operations, the ch.02+ch.04 synthesis point, the embedded demo, and the
  upload-fix-download loop described as the practical payoff.
- Use the same derivation-extraction mechanism as the other pages for any prose that
  echoes code comments; don't hand-paste.
- Update the home page's chapter list to include 06.

Commit: `docs: chapter 06 page and nav`.

## Out of scope

- Auto-repair / "fix all" buttons. The entire point is hand-editing with the user's
  judgement; an auto-corrector would undercut both this chapter and ch.05's framing. A
  validator that *shows* what's wrong is in scope; one that *changes* the data on its own
  is not.
- Audio re-synthesis or time-stretching the underlying audio to match edits. This chapter
  edits the beat map (the markers), not the audio. If a default audio clip is loaded for
  playback, edits move the grid/clicks over unchanged audio — same as ch.04.
- Supporting non-beat_this formats (MIDI, Ableton ASD, etc.). `.beats` TSV only.

## Working agreement (unchanged)

- All chapters' tests green at every commit; add tests when extending.
- Small, labelled commits per task.
- Do not alter existing derivation comments in earlier chapters; import their functions.
- Client-side only for uploads; no network. SSR-guard all canvas/window code.
- Ask before adding heavy dependencies — parsing, editing, and TSV export are all plain
  JS.
