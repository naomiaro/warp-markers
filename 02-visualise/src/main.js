// ===========================================================================
// main.js
//
// Entry point. Reads the UI controls, asks state.js for the current map +
// model, asks charts.js to paint them, and asks drag.js to wire up the
// click-and-drag on the warp chart.
//
// The whole point of the visualisation is the equality
//     beatsToSeconds(beta) === area under 60/BPM from 0 to beta
// so we render *both* numbers in the readout and report a residual. For
// constant and piecewise regimes the residual is 0 to numerical noise; for
// the ramp it is the trapezoid-vs-logarithm error, which decreases as the
// sample count grows.
// ===========================================================================
import { describePin } from "@warp-math/the-math/warp-marker.js";
import {
  BETA_MAX,
  snapshot,
  sampleSecPerBeat,
  sampleWarpMap,
  trapezoidArea,
  initialPiecewiseModel,
} from "./state.js";
import { makeTempoChart, makeWarpChart, updateCharts } from "./charts.js";
import { attachDragHandlers } from "./drag.js";

// ---------------------------------------------------------------------------
// UI state. The single object the rest of the file reads from.
// piecewiseModel is null until either (a) the BPM sliders fire (we build a
// fresh model from them) or (b) the user drags a dot (we keep the dragged
// model and stop listening to the BPM sliders until they touch them again).
// ---------------------------------------------------------------------------
const ui = {
  regime: "constant",
  constantBpm: 120,
  piecewiseBpms: [120, 90, 150],
  piecewiseModel: null, // null = "derive from sliders", non-null = "user has dragged"
  rampStart: 80,
  rampEnd: 200,
  rampLength: 16,
  curvedStart: 80,
  curvedEnd: 200,
  curvedLength: 12,
  curvedK: 2,
  cursor: 6,
};

// ---------------------------------------------------------------------------
// DOM lookup helpers.
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const readouts = {
  constantBpm: $("constant-bpm-readout"),
  seg1: $("seg1-bpm-readout"),
  seg2: $("seg2-bpm-readout"),
  seg3: $("seg3-bpm-readout"),
  rampStart: $("ramp-start-readout"),
  rampEnd: $("ramp-end-readout"),
  rampLength: $("ramp-length-readout"),
  curvedStart: $("curved-start-readout"),
  curvedEnd: $("curved-end-readout"),
  curvedLength: $("curved-length-readout"),
  curvedK: $("curved-k-readout"),
  beta: $("beta-readout"),
  tOfBeta: $("t-of-beta"),
  area: $("area-readout"),
  residual: $("residual-readout"),
  pinDesc: $("pin-description"),
};
const controlGroups = {
  constant: $("constant-controls"),
  piecewise: $("piecewise-controls"),
  ramp: $("ramp-controls"),
  curved: $("curved-controls"),
};

// ---------------------------------------------------------------------------
// Render: the single funnel through which the world is repainted.
// Everything that mutates `ui` calls render() afterwards.
// ---------------------------------------------------------------------------
function render() {
  const { map, model } = snapshot(ui);

  const tempoSamples = sampleSecPerBeat(map, BETA_MAX);
  const warpSamples = sampleWarpMap(map, BETA_MAX);

  updateCharts({
    tempoChart,
    warpChart,
    tempoSamples,
    warpSamples,
    cursorBeta: ui.cursor,
    markers: model,
  });

  // Numerical readouts. The whole teaching claim of this visualisation is
  // that these two numbers are the same.
  const t = map.beatsToSeconds(ui.cursor);
  const area = trapezoidArea(map, ui.cursor);
  readouts.beta.value = ui.cursor.toFixed(2);
  readouts.tOfBeta.value = t.toFixed(4);
  readouts.area.value = area.toFixed(4);
  readouts.residual.value = (area - t).toFixed(6);

  // Pin description: in piecewise mode, show the derived incoming/outgoing
  // BPM at every interior marker. This is what visibly changes when the user
  // drags a dot -- the two segments touching the marker are rescaled.
  if (model) {
    const lines = [];
    for (let i = 1; i < model.length; i++) {
      const { incomingBpm, outgoingBpm } = describePin(model, model[i].beat);
      lines.push(
        `β=${model[i].beat} @ ${model[i].second.toFixed(2)}s: ` +
          `incoming ${fmt(incomingBpm)} → outgoing ${fmt(outgoingBpm)} BPM`
      );
    }
    readouts.pinDesc.textContent = lines.join("  ·  ");
  } else {
    readouts.pinDesc.textContent = "";
  }
}

const fmt = (x) => (x == null ? "—" : x.toFixed(1));

// ---------------------------------------------------------------------------
// Chart construction. Must happen before render() can call updateCharts.
// ---------------------------------------------------------------------------
const tempoChart = makeTempoChart($("tempo-chart"), BETA_MAX);
const warpChart = makeWarpChart($("warp-chart"), BETA_MAX);

// Drag-to-pin on the warp chart. getModel returns the current piecewise model
// (or null in other regimes), onCommit installs a new model into ui state.
attachDragHandlers(warpChart, {
  getModel: () => (ui.regime === "piecewise" ? snapshot(ui).model : null),
  onPreview: (previewModel) => {
    ui.piecewiseModel = previewModel;
    render();
  },
  onCommit: (committedModel) => {
    ui.piecewiseModel = committedModel;
    render();
  },
});

// ---------------------------------------------------------------------------
// Control wiring. Every input updates ui and calls render(). Range sliders
// also update their <output> readout so users can read the value.
// ---------------------------------------------------------------------------
function showRegimeControls() {
  for (const k of Object.keys(controlGroups)) {
    controlGroups[k].hidden = k !== ui.regime;
  }
}

document.querySelectorAll('input[name="regime"]').forEach((input) => {
  input.addEventListener("change", (e) => {
    ui.regime = e.target.value;
    // Re-entering piecewise mode resets to the slider-derived model. If the
    // user wants to keep their dragged model across regime switches, they can
    // just not switch.
    if (ui.regime === "piecewise") {
      ui.piecewiseModel = initialPiecewiseModel(ui.piecewiseBpms);
    } else {
      ui.piecewiseModel = null;
    }
    showRegimeControls();
    render();
  });
});

$("constant-bpm").addEventListener("input", (e) => {
  ui.constantBpm = +e.target.value;
  readouts.constantBpm.value = ui.constantBpm;
  render();
});

const segInputs = [$("seg1-bpm"), $("seg2-bpm"), $("seg3-bpm")];
const segReadouts = [readouts.seg1, readouts.seg2, readouts.seg3];
segInputs.forEach((input, i) => {
  input.addEventListener("input", () => {
    ui.piecewiseBpms = ui.piecewiseBpms.map((v, k) => (k === i ? +input.value : v));
    segReadouts[i].value = input.value;
    // Slider use overrides any in-progress dragged model -- the slider is
    // the user's most recent intent.
    ui.piecewiseModel = initialPiecewiseModel(ui.piecewiseBpms);
    render();
  });
});

$("ramp-start").addEventListener("input", (e) => {
  ui.rampStart = +e.target.value;
  readouts.rampStart.value = ui.rampStart;
  render();
});
$("ramp-end").addEventListener("input", (e) => {
  ui.rampEnd = +e.target.value;
  readouts.rampEnd.value = ui.rampEnd;
  render();
});
$("ramp-length").addEventListener("input", (e) => {
  ui.rampLength = +e.target.value;
  readouts.rampLength.value = ui.rampLength;
  render();
});

$("curved-start").addEventListener("input", (e) => {
  ui.curvedStart = +e.target.value;
  readouts.curvedStart.value = ui.curvedStart;
  render();
});
$("curved-end").addEventListener("input", (e) => {
  ui.curvedEnd = +e.target.value;
  readouts.curvedEnd.value = ui.curvedEnd;
  render();
});
$("curved-length").addEventListener("input", (e) => {
  ui.curvedLength = +e.target.value;
  readouts.curvedLength.value = ui.curvedLength;
  render();
});
$("curved-k").addEventListener("input", (e) => {
  ui.curvedK = +e.target.value;
  readouts.curvedK.value = ui.curvedK.toFixed(2);
  render();
});

$("beta-cursor").addEventListener("input", (e) => {
  ui.cursor = +e.target.value;
  render();
});

// First paint.
showRegimeControls();
render();

// Expose the chart instances for ad-hoc inspection in the devtools console.
// Helpful for verifying scale conversions and inspecting the live model.
if (typeof window !== "undefined") {
  window.__warp = { tempoChart, warpChart, ui, snapshot: () => snapshot(ui) };
}
