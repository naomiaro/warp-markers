// ===========================================================================
// main.js -- the repair editor entry point.
//
// Three responsibilities, one render funnel:
//   1. Hold the editor state (markers + downbeatIndices + selected beat
//      + expected beats per bar). Every edit goes through the repair.js
//      operations and lands here as a new state.
//   2. Wire pointer + keyboard events on the canvas to the move / delete
//      / insert ops.
//   3. Run validateAgainstMeter on every state change and feed the
//      result into the renderer + summary readouts.
// ===========================================================================
import {
  deleteBeat,
  insertBeat,
  moveBeat,
  validateAgainstMeter,
  recoverDownbeats,
} from "../repair.js";
import { parseBeats, exportBeatsTsv } from "@warp-math/beats-io";
import { defaultFixture } from "./default-fixture.js";
import {
  drawTimeline,
  pickMarkerIndex,
  timeAtPointerX,
} from "./timeline.js";

const $ = (id) => document.getElementById(id);

const state = {
  markers: [],
  downbeatIndices: [],
  selected: null,
  expectedBpb: 4,
};

// ---------------------------------------------------------------------------
// Render: validate against meter, push everything into the canvas + readouts.
// ---------------------------------------------------------------------------
function render() {
  const bars = validateAgainstMeter(
    state.markers,
    state.downbeatIndices,
    state.expectedBpb
  );
  drawTimeline($("timeline"), { ...state, bars });

  // Summary numbers.
  $("ro-beats").value = String(state.markers.length);
  $("ro-downs").value = String(state.downbeatIndices.length);
  // Only count "real" bars (not pickup / trailing) for the correctness fraction.
  const realBars = bars.filter((b) => !b.isPickup && !b.isTrailing);
  const correct = realBars.filter((b) => b.ok).length;
  $("ro-correct").value = String(correct);
  $("ro-total").value = String(realBars.length);
  $("ro-done").hidden = !(realBars.length > 0 && correct === realBars.length);
}

// ---------------------------------------------------------------------------
// Inline error banner. Used when an edit was rejected (non-monotonic,
// duplicate, etc). Auto-dismisses after a short delay so the user has time
// to read it but it doesn't clutter the page forever.
// ---------------------------------------------------------------------------
let errorTimeout = null;
function showError(msg) {
  const el = $("inline-error");
  el.textContent = msg;
  el.hidden = false;
  if (errorTimeout) clearTimeout(errorTimeout);
  errorTimeout = setTimeout(() => {
    el.hidden = true;
  }, 3500);
}

// ---------------------------------------------------------------------------
// Reset to default broken fixture.
// ---------------------------------------------------------------------------
function loadDefault() {
  const fix = defaultFixture();
  state.markers = fix.markers;
  state.downbeatIndices = fix.downbeatIndices;
  state.selected = null;
  $("upload-status").textContent = "loaded the default broken fixture (4/4 with one extra, one dropped, and one mistimed beat).";
  render();
}

// ---------------------------------------------------------------------------
// File upload: parse the .beats TSV client-side. No network involved.
// ---------------------------------------------------------------------------
$("beats-input").addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = parseBeats(text);
    state.markers = parsed.map(({ second }) => ({ second }));
    state.downbeatIndices = recoverDownbeats(parsed);
    state.selected = null;
    $("upload-status").textContent = `${file.name}: ${parsed.length} beats, ${state.downbeatIndices.length} downbeats.`;
    render();
  } catch (err) {
    $("upload-status").textContent = `couldn't read ${file.name}: ${err.message}`;
  }
});

// ---------------------------------------------------------------------------
// Reset button.
// ---------------------------------------------------------------------------
$("reset-default").addEventListener("click", () => {
  loadDefault();
});

// ---------------------------------------------------------------------------
// Target beats-per-bar input.
// ---------------------------------------------------------------------------
$("expected-bpb").addEventListener("input", (e) => {
  const v = +e.target.value;
  if (Number.isInteger(v) && v >= 2 && v <= 12) {
    state.expectedBpb = v;
    render();
  }
});

// ---------------------------------------------------------------------------
// Canvas: drag-to-move, click-to-select, click-empty-to-insert.
//
// The interaction model:
//   - pointerdown on a marker  -> start a drag (state.selected = idx)
//   - pointerdown on empty     -> insert a beat at that time, then select it
//   - pointermove during drag  -> moveBeat (catching monotonicity errors)
//   - pointerup                -> end drag
//   - Delete / Backspace key   -> delete the selected beat
//
// Threshold to distinguish "click on marker" from "drag of marker": any
// pointermove between down and up enters drag mode.
// ---------------------------------------------------------------------------
const canvas = $("timeline");
let dragIndex = null;
let dragMoved = false;
let originalMarkers = null;

canvas.addEventListener("pointerdown", (e) => {
  const idx = pickMarkerIndex(canvas, e.clientX, e.clientY, state.markers);
  if (idx != null) {
    dragIndex = idx;
    dragMoved = false;
    originalMarkers = state.markers;
    state.selected = idx;
    render();
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  // Empty click: insert a beat at the click time.
  const sec = timeAtPointerX(canvas, e.clientX, state.markers);
  if (sec == null || sec < 0) return;
  try {
    const r = insertBeat(state.markers, state.downbeatIndices, sec);
    state.markers = r.markers;
    state.downbeatIndices = r.downbeatIndices;
    state.selected = r.insertedAt;
    render();
  } catch (err) {
    showError(err.message);
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (dragIndex == null) return;
  dragMoved = true;
  const sec = timeAtPointerX(canvas, e.clientX, state.markers);
  if (sec == null) return;
  try {
    state.markers = moveBeat(originalMarkers, dragIndex, sec);
    render();
  } catch {
    // Out-of-range mid-drag: keep the original until the user releases
    // somewhere valid. Don't flash an error banner on every frame.
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (dragIndex == null) return;
  if (!dragMoved) {
    // It was a click on a marker, not a drag -- selection is already set.
  }
  dragIndex = null;
  dragMoved = false;
  originalMarkers = null;
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
});

// Keyboard: Delete / Backspace removes the selected beat.
window.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (state.selected == null) return;
  // Only swallow if the target isn't an input/textarea (let normal text
  // editing through).
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
  e.preventDefault();
  try {
    const r = deleteBeat(state.markers, state.downbeatIndices, state.selected);
    state.markers = r.markers;
    state.downbeatIndices = r.downbeatIndices;
    // Move selection to the previous beat if any, else clear.
    state.selected = state.selected > 0 ? state.selected - 1 : null;
    render();
  } catch (err) {
    showError(err.message);
  }
});

// ---------------------------------------------------------------------------
// Download corrected .beats. Builds the TSV via exportBeatsTsv and triggers
// a client download. No network round-trip.
// ---------------------------------------------------------------------------
$("download-beats").addEventListener("click", () => {
  if (state.markers.length === 0) {
    showError("nothing to export yet -- load a beat map first");
    return;
  }
  const text = exportBeatsTsv(state.markers, state.downbeatIndices);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "corrected.beats";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// Resize: redraw on layout changes.
new ResizeObserver(() => render()).observe(canvas);

// First paint.
loadDefault();

// Expose for ad-hoc inspection.
if (typeof window !== "undefined") {
  window.__warpRepair = { state, render };
}
