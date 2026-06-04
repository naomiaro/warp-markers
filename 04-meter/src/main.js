// ===========================================================================
// main.js
//
// Entry point. Wires controls, drag-to-pin, and the metronome render loop.
// All math comes from @warp-math/the-math (tempo / pin) and @warp-math/meter
// (bar position / click selection). Nothing here re-derives either layer.
// ===========================================================================
import { barPositionOf } from "../meter.js";
import {
  N_BEATS,
  defaultWarpModel,
  snapshot,
  tryPin,
} from "./state.js";
import {
  drawTimeline,
  pickMarkerIndex,
  secondFromPointerX,
} from "./timeline.js";
import { createMetronome } from "./metronome.js";

const $ = (id) => document.getElementById(id);

const ui = {
  meterPreset: "4-4",
  bpm: 120,
  warpModel: defaultWarpModel(120),
  cursorSec: 0,
};

const metro = createMetronome();
let dragIndex = null;
let originalModel = null;

// ---------------------------------------------------------------------------
// Derived helpers. The proof-table & metronome both need each beat's
// second-time, which lives in the tempo layer. Compute once, hand around.
// ---------------------------------------------------------------------------
function beatSecondsFor(snap) {
  const out = new Array(N_BEATS + 1);
  for (let i = 0; i <= N_BEATS; i++) out[i] = snap.tempo.beatsToSeconds(i);
  return out;
}

function durationOf(snap) {
  // Add a half-second tail so the last beat has room to ring out.
  return snap.tempo.beatsToSeconds(N_BEATS) + 0.5;
}

// ---------------------------------------------------------------------------
// Render. The render loop is rAF-driven so the playhead stays smooth.
// ---------------------------------------------------------------------------
function renderProofTable(snap) {
  const tbody = $("proof-table").querySelector("tbody");
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  for (let i = 0; i <= N_BEATS; i++) {
    const { bar, positionInBar, isDownbeat } = barPositionOf(snap.meterMap, i);
    const sec = snap.tempo.beatsToSeconds(i);
    const tr = document.createElement("tr");
    if (isDownbeat) tr.classList.add("downbeat");
    const addCell = (text) => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    };
    addCell(String(i));
    addCell(String(bar + 1));
    addCell(String(positionInBar));
    addCell(sec.toFixed(3));
    tbody.appendChild(tr);
  }
}

function renderStaticReadouts(snap) {
  // Count downbeats by asking the meter layer once per beat. The number is
  // small, so an O(N) sweep is fine and keeps the demo honest.
  let down = 0;
  for (let i = 0; i <= N_BEATS; i++) {
    if (barPositionOf(snap.meterMap, i).isDownbeat) down++;
  }
  $("ro-nbeats").textContent = String(N_BEATS + 1);
  $("ro-ndown").textContent = String(down);
}

function renderEverything() {
  const snap = snapshot(ui);
  renderProofTable(snap);
  renderStaticReadouts(snap);
}

function tickFrame() {
  const snap = snapshot(ui);
  const canvas = $("timeline");
  const cur = metro.getCurrentSec();
  const dur = durationOf(snap);

  drawTimeline(canvas, {
    snap,
    currentSec: cur,
    durationSec: dur,
    draggedBeat: dragIndex,
  });

  // Live playhead readouts. We invert the tempo map to recover beta, then
  // ask the meter layer for the bar/position at that beat.
  const beta = snap.tempo.secondsToBeats(cur);
  $("ro-beta").textContent = beta.toFixed(2);
  const i = Math.max(0, Math.min(N_BEATS, Math.round(beta)));
  const { bar, positionInBar } = barPositionOf(snap.meterMap, i);
  $("ro-bar").textContent = `bar ${bar + 1}, pos ${positionInBar}`;

  // Auto-pause at the end.
  if (metro.isPlaying() && cur >= dur) {
    metro.pause();
    $("play-pause").textContent = "play";
  }

  requestAnimationFrame(tickFrame);
}
requestAnimationFrame(tickFrame);

// ---------------------------------------------------------------------------
// Control wiring.
// ---------------------------------------------------------------------------
document.querySelectorAll('input[name="meter"]').forEach((input) => {
  input.addEventListener("change", (e) => {
    ui.meterPreset = e.target.value;
    renderEverything();
  });
});

$("bpm").addEventListener("input", (e) => {
  ui.bpm = +e.target.value;
  $("bpm-readout").textContent = String(ui.bpm);
  // Changing the BPM resets the warp model -- the slider sets a *steady* base
  // tempo, then the user can re-warp by dragging again.
  ui.warpModel = defaultWarpModel(ui.bpm);
  metro.seek(0);
  $("play-pause").textContent = "play";
  renderEverything();
});

$("play-pause").addEventListener("click", async () => {
  if (metro.isPlaying()) {
    metro.pause();
    $("play-pause").textContent = "play";
    return;
  }
  const snap = snapshot(ui);
  await metro.play({
    meterMap: snap.meterMap,
    beatSeconds: beatSecondsFor(snap),
    fromSec: metro.getCurrentSec(),
  });
  $("play-pause").textContent = "pause";
});

$("rewind").addEventListener("click", () => {
  metro.pause();
  metro.seek(0);
  $("play-pause").textContent = "play";
});

// ---------------------------------------------------------------------------
// Drag-to-pin on the timeline canvas. Pointer events use canvas-local pixel
// math from timeline.js so the geometry stays in one file.
// ---------------------------------------------------------------------------
const canvas = $("timeline");

canvas.addEventListener("pointerdown", (e) => {
  const snap = snapshot(ui);
  const dur = durationOf(snap);
  const idx = pickMarkerIndex(canvas, e.clientX, e.clientY, snap.model, dur);
  if (idx == null) return;
  dragIndex = idx;
  originalModel = snap.model;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
  // Pause playback while the user is editing -- a moving target plus a
  // moving playhead obscures the lesson.
  if (metro.isPlaying()) {
    metro.pause();
    $("play-pause").textContent = "play";
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (dragIndex == null) return;
  const snap = snapshot(ui);
  const dur = durationOf(snap);
  const newSec = secondFromPointerX(canvas, e.clientX, dur);
  const beat = originalModel[dragIndex].beat;
  const next = tryPin(originalModel, beat, newSec);
  if (next) {
    ui.warpModel = next;
    renderEverything();
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (dragIndex == null) return;
  dragIndex = null;
  originalModel = null;
  canvas.classList.remove("dragging");
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }
});

// First paint.
renderEverything();

// Expose for ad-hoc inspection.
if (typeof window !== "undefined") {
  window.__warpMeter = { ui, metro, snapshot: () => snapshot(ui) };
}
